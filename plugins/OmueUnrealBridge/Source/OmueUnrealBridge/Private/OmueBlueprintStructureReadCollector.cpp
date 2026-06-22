// Copyright OMUE. All Rights Reserved.
//
// K2b-1 — Blueprint graph structure summary read-only collector.
// K2b-2b — Single-graph node/pin/link detail export.
//
// UE 5.7.4 API used (all verified via K2b-1 or prior phases):
//   FContentBrowserModule::Get().GetSelectedAssets()
//   Cast<UBlueprint>(Asset)
//   UBlueprint::UbergraphPages / FunctionGraphs / MacroGraphs
//   UEdGraph::Nodes → TArray<TObjectPtr<UEdGraphNode>>
//   UEdGraphNode::Pins → TArray<TObjectPtr<UEdGraphPin>>
//   UEdGraphPin::LinkedTo → TArray<UEdGraphPin*>
//   UEdGraphPin::Direction → EEdGraphPinDirection (EGPD_Input / EGPD_Output)
//   UEdGraphPin::PinType.PinCategory / PinSubCategory / ContainerType
//   UEdGraphNode::NodeGuid, GetNodeTitle(), GetName()
//   UK2Node_Event / UK2Node_CustomEvent / UK2Node_FunctionEntry → BlueprintGraph module
//   UBlueprint::NewVariables → TArray<FBPVariableDescription>
//   UBlueprint::DelegateSignatureGraphs
//   UFunction reflection via GeneratedClass::FindFunctionByName
//
// E5b confirmed read-only (implemented in ReadNodeErrorState):
//   - Node->IsNodeEnabled(), Node->ErrorType, Node->ErrorMsg
//
// E51: K2Node_* types verified in docs/blueprint-graph-detail-k2b2-plan.md §7.2.3
//   (CallFunction, CallParentFunction, VariableGet/Set, IfThenElse,
//    ExecutionSequence, MacroInstance, DynamicCast, ClassDynamicCast,
//    Tunnel, Literal). Other unverified subclasses → "unknown".
//
// Explicitly NOT doing:
//   - Node->GetAllPins() (unverified; uses Node->Pins instead)
//   - Pin default value fields (DefaultValue, DefaultTextValue, etc.)
//   - Asset modification (Modify, MarkPackageDirty, SavePackage)
//   - Blueprint compilation
//   - AssetRegistry scanning
//   - PIE / Automation Tests

#include "OmueBlueprintStructureReadCollector.h"
#include "OmueUnrealBridgeModule.h"

#include "Editor.h"
#include "ContentBrowserModule.h"
#include "IContentBrowserSingleton.h"
#include "AssetRegistry/AssetData.h"

#include "Engine/Blueprint.h"
#include "EdGraph/EdGraph.h"
#include "EdGraph/EdGraphNode.h"
#include "EdGraph/EdGraphPin.h"

// K2Node includes — all verified against UE 5.7.4 headers
//   (docs/blueprint-graph-detail-k2b2-plan.md §7.2.3):
//   K2Node_Event.h / CustomEvent.h / FunctionEntry.h — K2b-1 confirmed
//   K2Node_CallFunction.h / CallParentFunction.h — §7.2.3 #16/#27
//   K2Node_VariableGet.h / K2Node_VariableSet.h — §7.2.3 #20
//   K2Node_IfThenElse.h / ExecutionSequence.h — §7.2.3 #21/#22
//   K2Node_DynamicCast.h / ClassDynamicCast.h — §7.2.3 #23
//   K2Node_MacroInstance.h — §7.2.3 #24
//   K2Node_Tunnel.h — §7.2.3 #25
//   K2Node_Literal.h — §7.2.3 #26
#include "K2Node_Event.h"
#include "K2Node_CustomEvent.h"
#include "K2Node_FunctionEntry.h"
#include "K2Node_CallFunction.h"
#include "K2Node_CallParentFunction.h"
#include "K2Node_Variable.h"
#include "K2Node_VariableGet.h"
#include "K2Node_VariableSet.h"
#include "K2Node_IfThenElse.h"
#include "K2Node_ExecutionSequence.h"
#include "K2Node_MacroInstance.h"
#include "K2Node_DynamicCast.h"
#include "K2Node_ClassDynamicCast.h"
#include "K2Node_Tunnel.h"
#include "K2Node_Literal.h"

#include "Logging/TokenizedMessage.h" // E5b: EMessageSeverity for ErrorType mapping

#include "UObject/Package.h"
#include "Misc/DateTime.h"

// ── Constants ────────────────────────────────────────────────────

static const TCHAR* FormatVersion = TEXT("0.1.0");
static const TCHAR* SourceLive    = TEXT("live");

// ── Enum → string helpers ──────────────────────────────────────

namespace
{
    const TCHAR* BlueprintTypeToString(EBlueprintType Type)
    {
        switch (Type)
        {
        case BPTYPE_Normal:          return TEXT("BPTYPE_Normal");
        case BPTYPE_Const:           return TEXT("BPTYPE_Const");
        case BPTYPE_MacroLibrary:    return TEXT("BPTYPE_MacroLibrary");
        case BPTYPE_Interface:       return TEXT("BPTYPE_Interface");
        case BPTYPE_LevelScript:     return TEXT("BPTYPE_LevelScript");
        case BPTYPE_FunctionLibrary: return TEXT("BPTYPE_FunctionLibrary");
        default:                     return TEXT("BPTYPE_Normal");
        }
    }

    const TCHAR* BlueprintStatusToString(TEnumAsByte<EBlueprintStatus> InStatus)
    {
        switch (InStatus)
        {
        case BS_Unknown:               return TEXT("BS_Unknown");
        case BS_Dirty:                 return TEXT("BS_Dirty");
        case BS_Error:                 return TEXT("BS_Error");
        case BS_UpToDate:              return TEXT("BS_UpToDate");
        case BS_BeingCreated:          return TEXT("BS_BeingCreated");
        case BS_UpToDateWithWarnings:   return TEXT("BS_UpToDateWithWarnings");
        default:                       return TEXT("BS_Unknown");
        }
    }

    /** Classify an event node by its function name. */
    const TCHAR* ClassifyEventType(const FString& EventName)
    {
        if (EventName == TEXT("ReceiveBeginPlay"))
            return TEXT("BeginPlay");
        if (EventName == TEXT("ReceiveTick"))
            return TEXT("Tick");
        if (EventName == TEXT("ReceiveEndPlay"))
            return TEXT("EndPlay");
        if (EventName == TEXT("UserConstructionScript"))
            return TEXT("ConstructionScript");
        if (EventName.Contains(TEXT("ReceiveActorBeginOverlap")))
            return TEXT("ActorBeginOverlap");
        if (EventName.Contains(TEXT("ReceiveActorEndOverlap")))
            return TEXT("ActorEndOverlap");
        if (EventName.Contains(TEXT("ReceiveHit")))
            return TEXT("ActorHit");
        if (EventName.Contains(TEXT("ReceiveAnyDamage")))
            return TEXT("OnTakeAnyDamage");
        if (EventName.Contains(TEXT("ReceivePointDamage")))
            return TEXT("OnTakePointDamage");
        if (EventName.Contains(TEXT("ReceiveRadialDamage")))
            return TEXT("OnTakeRadialDamage");
        if (EventName.Contains(TEXT("ReceiveDestroyed")))
            return TEXT("Destroyed");
        if (EventName.StartsWith(TEXT("Receive")))
            return TEXT("BlueprintImplementableEvent");
        if (EventName.StartsWith(TEXT("InpAct")))
            return TEXT("InputAction");
        if (EventName.StartsWith(TEXT("Inp")))
            return TEXT("InputKey");
        return TEXT("unknown");
    }

    /** Build a property type string from an FProperty. */
    FString PropertyTypeToString(FProperty* Prop)
    {
        if (Prop == nullptr)
            return TEXT("unknown");

        FString CppType = Prop->GetCPPType();
        if (Prop->IsA<FObjectProperty>())
        {
            // Add pointer suffix for object types
            if (!CppType.EndsWith(TEXT("*")))
                CppType += TEXT("*");
        }
        return CppType;
    }
}

// ═══════════════════════════════════════════════════════════════
// ClassifyGraphKind
// ═══════════════════════════════════════════════════════════════

FString OmueBlueprintStructureReadCollector::ClassifyGraphKind(
    const UBlueprint* BP,
    const TCHAR* Source)
{
    if (FCString::Strcmp(Source, TEXT("UbergraphPages")) == 0)
    {
        // Interface Blueprints store function graphs in UbergraphPages
        if (BP != nullptr && BP->BlueprintType == BPTYPE_Interface)
            return TEXT("interface");
        return TEXT("event");
    }
    if (FCString::Strcmp(Source, TEXT("FunctionGraphs")) == 0)
        return TEXT("function");
    if (FCString::Strcmp(Source, TEXT("MacroGraphs")) == 0)
        return TEXT("macro");
    if (FCString::Strcmp(Source, TEXT("DelegateSignatureGraphs")) == 0)
        return TEXT("delegate");
    return TEXT("unknown");
}

// ═══════════════════════════════════════════════════════════════
// CountUniqueLinks
//
// Counts unique connections in a graph by normalising pin pointer
// pairs to avoid double-counting bidirectional links.
// Each unique (pinA, pinB) pair is counted once regardless of direction.
// ═══════════════════════════════════════════════════════════════

int32 OmueBlueprintStructureReadCollector::CountUniqueLinks(const UEdGraph* Graph)
{
    if (Graph == nullptr)
        return 0;

    TSet<FString> LinkSet;

    for (UEdGraphNode* Node : Graph->Nodes)
    {
        if (Node == nullptr)
            continue;

        for (UEdGraphPin* Pin : Node->Pins)
        {
            if (Pin == nullptr)
                continue;

            for (UEdGraphPin* LinkedTo : Pin->LinkedTo)
            {
                if (LinkedTo == nullptr)
                    continue;

                // Normalise: smaller pointer first to avoid double-counting
                const void* A = static_cast<const void*>(Pin);
                const void* B = static_cast<const void*>(LinkedTo);
                if (A > B)
                    Swap(A, B);

                FString Key = FString::Printf(TEXT("%p_%p"), A, B);
                LinkSet.Add(Key);
            }
        }
    }

    return LinkSet.Num();
}

// ═══════════════════════════════════════════════════════════════
// CollectEventsFromGraph
//
// Iterates nodes in an event graph to find UK2Node_Event and
// UK2Node_CustomEvent instances.  Only reads event name/type;
// does not serialise node details.
// ═══════════════════════════════════════════════════════════════

void OmueBlueprintStructureReadCollector::CollectEventsFromGraph(
    const UEdGraph* Graph,
    const FString& GraphId,
    int32 GraphNodeCount,
    TArray<FOmueBPEventInfo>& OutEvents)
{
    if (Graph == nullptr)
        return;

    for (UEdGraphNode* Node : Graph->Nodes)
    {
        if (Node == nullptr)
            continue;

        FOmueBPEventInfo Event;
        Event.GraphId       = GraphId;
        Event.NodeCount     = GraphNodeCount;

        // Check UK2Node_CustomEvent first — it inherits from UK2Node_Event,
        // so the more specific cast must come before the base class cast.
        if (UK2Node_CustomEvent* CustomEventNode = Cast<UK2Node_CustomEvent>(Node))
        {
            const FName CustomFuncName = CustomEventNode->CustomFunctionName;
            if (CustomFuncName != NAME_None)
            {
                Event.Name      = CustomFuncName.ToString();
                Event.EventType = TEXT("CustomEvent");
                OutEvents.Add(Event);
            }
        }
        else if (UK2Node_Event* EventNode = Cast<UK2Node_Event>(Node))
        {
            // Native event override — read from EventReference.
            if (EventNode->EventReference.GetMemberName() != NAME_None)
            {
                Event.Name       = EventNode->EventReference.GetMemberName().ToString();
                Event.EventType  = ClassifyEventType(Event.Name);
                OutEvents.Add(Event);
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// CollectFunctionInfo
//
// Collects function-level summary info using UFunction reflection
// on the Blueprint's GeneratedClass.  Does NOT traverse function
// graph nodes for signature data — uses reflection instead.
// ═══════════════════════════════════════════════════════════════

bool OmueBlueprintStructureReadCollector::CollectFunctionInfo(
    const UBlueprint* BP,
    const UEdGraph* Graph,
    const FString& Kind,
    FOmueBPFunctionInfo& OutFunc)
{
    if (BP == nullptr || Graph == nullptr)
        return false;

    // ── Count nodes in the function graph ──────────────────────
    int32 NodeCount = 0;
    if (Graph->Nodes.Num() > 0)
    {
        NodeCount = Graph->Nodes.Num();
    }

    // ── Get the UFunction via GeneratedClass ────────────────────
    FName FuncName = FName(*Graph->GetName());
    UFunction* Func = nullptr;
    if (BP->GeneratedClass != nullptr)
    {
        Func = BP->GeneratedClass->FindFunctionByName(FuncName, EIncludeSuperFlag::ExcludeSuper);
    }

    OutFunc.Name       = Graph->GetName();
    OutFunc.GraphId    = FString::Printf(TEXT("%s::%s"), *Kind, *Graph->GetName());
    OutFunc.NodeCount  = NodeCount;
    OutFunc.bIsOverride = false;
    OutFunc.bIsPure     = false;
    OutFunc.bIsConst    = false;

    if (Func != nullptr)
    {
        OutFunc.bIsPure  = Func->HasAnyFunctionFlags(FUNC_BlueprintPure);
        OutFunc.bIsConst = Func->HasAnyFunctionFlags(FUNC_Const);

        // Check if this function overrides a parent function.
        if (BP->ParentClass != nullptr)
        {
            UFunction* ParentFunc = BP->ParentClass->FindFunctionByName(
                FuncName, EIncludeSuperFlag::ExcludeSuper);
            OutFunc.bIsOverride = (ParentFunc != nullptr);
        }

        // ── Enumerate parameters via reflection ────────────────
        for (TFieldIterator<FProperty> It(Func); It; ++It)
        {
            FProperty* Prop = *It;
            FOmueBPParamInfo Param;
            Param.Name         = Prop->GetName();
            Param.Type         = PropertyTypeToString(Prop);
            Param.bIsArray     = Prop->ArrayDim > 1 || Prop->IsA<FArrayProperty>();
            Param.bIsReference = Prop->HasAnyPropertyFlags(CPF_OutParm) &&
                                 !Prop->HasAnyPropertyFlags(CPF_ReturnParm);

            if (Prop->HasAnyPropertyFlags(CPF_ReturnParm))
            {
                Param.bIsReturnValue = true;
                OutFunc.OutputParams.Add(Param);
            }
            else
            {
                Param.bIsReturnValue = false;
                OutFunc.InputParams.Add(Param);
            }
        }
    }

    return true;
}

// ═══════════════════════════════════════════════════════════════
// CollectVariableInfo
//
// Converts a FBPVariableDescription to a summary-level variable
// definition.  Reads only metadata fields; does not modify the
// variable.
// ═══════════════════════════════════════════════════════════════

bool OmueBlueprintStructureReadCollector::CollectVariableInfo(
    const FBPVariableDescription& VarDesc,
    FOmueBPVariableInfo& OutVar)
{
    OutVar.Name       = VarDesc.VarName.ToString();
    OutVar.Category   = VarDesc.VarType.PinCategory.ToString();

    // Build type string from PinCategory + PinSubCategory
    FString TypeStr = VarDesc.VarType.PinCategory.ToString();
    if (!VarDesc.VarType.PinSubCategory.IsNone() &&
        VarDesc.VarType.PinCategory != VarDesc.VarType.PinSubCategory)
    {
        TypeStr = VarDesc.VarType.PinSubCategory.ToString();
    }

    // Append container markers
    if (VarDesc.VarType.ContainerType == EPinContainerType::Array)
    {
        TypeStr += TEXT("[]");
        OutVar.bIsArray = true;
    }
    else if (VarDesc.VarType.ContainerType == EPinContainerType::Map)
    {
        TypeStr += TEXT("<Map>");
    }
    else if (VarDesc.VarType.ContainerType == EPinContainerType::Set)
    {
        TypeStr += TEXT("<Set>");
    }

    OutVar.Type = TypeStr;

    // ── Property flags ─────────────────────────────────────────
    // CPF_Edit → Editable (Expose on spawn)
    // CPF_BlueprintVisible → Readable in Blueprint
    // CPF_DisableEditOnInstance → NOT editable on placed instance
    // CPF_ExposeOnSpawn → Expose on spawn checkbox
    OutVar.bIsEditable = (VarDesc.PropertyFlags & CPF_Edit) != 0;
    OutVar.bIsExposed  = (VarDesc.PropertyFlags & CPF_ExposeOnSpawn) != 0;

    // ── Default value ──────────────────────────────────────────
    if (!VarDesc.DefaultValue.IsEmpty())
    {
        OutVar.DefaultValue = VarDesc.DefaultValue;
    }

    return true;
}

// ═══════════════════════════════════════════════════════════════
// TryGetBlueprintStructure — MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════

bool OmueBlueprintStructureReadCollector::TryGetBlueprintStructure(
    FOmueBPStructureSummary& OutSummary) const
{
    if (GEditor == nullptr)
        return false;

    // ── 1. Get selected assets from Content Browser ──────────────
    FContentBrowserModule& ContentBrowserModule =
        FModuleManager::LoadModuleChecked<FContentBrowserModule>(TEXT("ContentBrowser"));

    TArray<FAssetData> SelectedAssets;
    ContentBrowserModule.Get().GetSelectedAssets(SelectedAssets);

    if (SelectedAssets.Num() == 0)
        return false;

    // ── 2. Find the first Blueprint in selection ─────────────────
    UBlueprint* Blueprint = nullptr;
    FAssetData BlueprintAssetData;

    for (const FAssetData& AssetData : SelectedAssets)
    {
        UObject* Asset = AssetData.GetAsset();
        if (Asset == nullptr)
            continue;

        Blueprint = Cast<UBlueprint>(Asset);
        if (Blueprint != nullptr)
        {
            BlueprintAssetData = AssetData;
            break;
        }
    }

    if (Blueprint == nullptr)
        return false;

    // ═══════════════════════════════════════════════════════════
    // EXPORT META
    // ═══════════════════════════════════════════════════════════
    OutSummary.ExportMeta.FormatVersion   = FormatVersion;
    OutSummary.ExportMeta.ExportedAt      = FDateTime::UtcNow().ToIso8601();
    OutSummary.ExportMeta.Source          = SourceLive;
    OutSummary.ExportMeta.AssetPath       = BlueprintAssetData.GetObjectPathString();
    // includedGraphIds stays empty in K2b-1

    // ═══════════════════════════════════════════════════════════
    // BLUEPRINT METADATA
    // ═══════════════════════════════════════════════════════════
    OutSummary.Name        = BlueprintAssetData.AssetName.ToString();
    OutSummary.PackagePath = BlueprintAssetData.PackageName.ToString();
    OutSummary.ObjectPath  = BlueprintAssetData.GetObjectPathString();
    OutSummary.AssetClass  = BlueprintAssetData.AssetClassPath.GetAssetName().ToString();

    if (Blueprint->ParentClass != nullptr)
        OutSummary.ParentClassName = Blueprint->ParentClass->GetName();
    if (Blueprint->GeneratedClass != nullptr)
        OutSummary.GeneratedClassName = Blueprint->GeneratedClass->GetName();
    if (Blueprint->SkeletonGeneratedClass != nullptr)
        OutSummary.SkeletonClassName = Blueprint->SkeletonGeneratedClass->GetName();

    OutSummary.BlueprintType = BlueprintTypeToString(Blueprint->BlueprintType);
    OutSummary.Status        = BlueprintStatusToString(Blueprint->Status);

    // isDataOnly: conservative (same as K2a).
    OutSummary.bIsDataOnly = false;

    {
        UPackage* Pkg = Blueprint->GetOutermost();
        if (Pkg != nullptr)
            OutSummary.bIsDirty = Pkg->IsDirty();
    }

    // ═══════════════════════════════════════════════════════════
    // GRAPHS — collect name/kind/nodeCount/linkCount/isEntryGraph
    // ═══════════════════════════════════════════════════════════
    {
        auto CollectGraphs = [&](const auto& GraphArray, const TCHAR* Source)
        {
            for (const auto& Graph : GraphArray)
            {
                if (Graph == nullptr)
                    continue;

                FOmueBPGraphInfo Info;
                Info.Kind    = ClassifyGraphKind(Blueprint, Source);
                Info.Name    = Graph->GetName();
                Info.GraphId = FString::Printf(TEXT("%s::%s"), *Info.Kind, *Info.Name);

                // Read node count (no node details serialised)
                Info.NodeCount = Graph->Nodes.Num();
                OutSummary.TotalNodeCount += Info.NodeCount;

                // Count unique links (deduplicated, no link details serialised)
                Info.LinkCount = CountUniqueLinks(Graph);
                OutSummary.TotalLinkCount += Info.LinkCount;

                // Entry graph: the main EventGraph (named "EventGraph") from UbergraphPages
                Info.bIsEntryGraph =
                    (FCString::Strcmp(Source, TEXT("UbergraphPages")) == 0) &&
                    (Info.Name == TEXT("EventGraph"));

                OutSummary.Graphs.Add(Info);
            }
        };

        CollectGraphs(Blueprint->UbergraphPages, TEXT("UbergraphPages"));
        CollectGraphs(Blueprint->FunctionGraphs, TEXT("FunctionGraphs"));
        CollectGraphs(Blueprint->MacroGraphs,              TEXT("MacroGraphs"));
        CollectGraphs(Blueprint->DelegateSignatureGraphs,   TEXT("DelegateSignatureGraphs"));

        OutSummary.GraphCount = OutSummary.Graphs.Num();
    }

    // ═══════════════════════════════════════════════════════════
    // VARIABLES
    // ═══════════════════════════════════════════════════════════
    {
        for (const FBPVariableDescription& VarDesc : Blueprint->NewVariables)
        {
            FOmueBPVariableInfo Var;
            if (CollectVariableInfo(VarDesc, Var))
                OutSummary.Variables.Add(Var);
        }
        OutSummary.VariableCount = OutSummary.Variables.Num();
    }

    // ═══════════════════════════════════════════════════════════
    // FUNCTIONS — via UFunction reflection
    // ═══════════════════════════════════════════════════════════
    {
        for (const auto& Graph : Blueprint->FunctionGraphs)
        {
            if (Graph == nullptr)
                continue;

            FOmueBPFunctionInfo Func;
            if (CollectFunctionInfo(Blueprint, Graph.Get(), TEXT("function"), Func))
                OutSummary.Functions.Add(Func);
        }
        OutSummary.FunctionCount = OutSummary.Functions.Num();
    }

    // ═══════════════════════════════════════════════════════════
    // EVENTS — from event graph nodes (UK2Node_Event / CustomEvent)
    // ═══════════════════════════════════════════════════════════
    {
        for (const auto& Graph : Blueprint->UbergraphPages)
        {
            if (Graph == nullptr)
                continue;

            FString GraphId = FString::Printf(TEXT("event::%s"), *Graph->GetName());
            int32 GraphNodeCount = Graph->Nodes.Num();
            CollectEventsFromGraph(Graph.Get(), GraphId, GraphNodeCount, OutSummary.Events);
        }
        OutSummary.EventCount = OutSummary.Events.Num();
    }

    // ═══════════════════════════════════════════════════════════
    // MACROS
    // ═══════════════════════════════════════════════════════════
    {
        for (const auto& Graph : Blueprint->MacroGraphs)
        {
            if (Graph == nullptr)
                continue;

            FOmueBPMacroInfo Macro;
            Macro.Name      = Graph->GetName();
            Macro.GraphId   = FString::Printf(TEXT("macro::%s"), *Macro.Name);
            Macro.NodeCount = Graph->Nodes.Num();
            OutSummary.Macros.Add(Macro);
        }
        OutSummary.MacroCount = OutSummary.Macros.Num();
    }

    return true;
}

// ═══════════════════════════════════════════════════════════════
// K2b-2b: Single-graph detail helpers (anonymous namespace)
// ═══════════════════════════════════════════════════════════════

namespace
{
    // ── Truncation limits ─────────────────────────────────────
    constexpr int32 MaxNodesPerGraph = 500;
    constexpr int32 MaxPinsPerNode  = 200;
    constexpr int32 MaxLinksPerGraph = 2000;

    // ── Pin kind classification ───────────────────────────────
    FString ClassifyPinKind(const UEdGraphPin* Pin)
    {
        if (Pin == nullptr)
            return TEXT("unknown");

        const FString Cat = Pin->PinType.PinCategory.ToString();
        if (Cat == TEXT("exec"))
            return TEXT("execute");
        if (Cat == TEXT("delegate"))
            return TEXT("delegate");
        return TEXT("data");
    }

    // ── Pin direction → string ────────────────────────────────
    FString PinDirectionToString(EEdGraphPinDirection Dir)
    {
        switch (Dir)
        {
        case EGPD_Input:  return TEXT("input");
        case EGPD_Output: return TEXT("output");
        default:          return TEXT("input");
        }
    }

    // ── Pin type → readable string ────────────────────────────
    FString SerializePinType(const UEdGraphPin* Pin)
    {
        if (Pin == nullptr)
            return TEXT("unknown");

        FString TypeStr = Pin->PinType.PinCategory.ToString();

        if (!Pin->PinType.PinSubCategory.IsNone() &&
            Pin->PinType.PinCategory != Pin->PinType.PinSubCategory)
        {
            TypeStr = Pin->PinType.PinSubCategory.ToString();
        }

        // Object subcategory provides the concrete class/struct name
        if (Pin->PinType.PinSubCategoryObject.IsValid())
        {
            UObject* SubCatObj = Pin->PinType.PinSubCategoryObject.Get();
            if (SubCatObj != nullptr)
                TypeStr = SubCatObj->GetName();
        }

        // Container markers
        if (Pin->PinType.ContainerType == EPinContainerType::Array)
            TypeStr += TEXT("[]");
        else if (Pin->PinType.ContainerType == EPinContainerType::Map)
            TypeStr += TEXT("<Map>");
        else if (Pin->PinType.ContainerType == EPinContainerType::Set)
            TypeStr += TEXT("<Set>");

        return TypeStr;
    }

    // ── Node type classification ──────────────────────────────
    // All Cast<> checks are read-only type identification against
    // already-loaded UEdGraphNode* objects. Headers verified in
    // docs/blueprint-graph-detail-k2b2-plan.md §7.2.3.
    //
    // Order matters: more specific subclasses before base classes.
    // Unknown/unhandled subclasses degrade to "unknown" (no guess).
    FString ClassifyNodeType(UEdGraphNode* Node)
    {
        if (Node == nullptr)
            return TEXT("unknown");

        // ── Event / Entry ──────────────────────────────────
        // CustomEvent inherits from Event — check specific first
        if (Cast<UK2Node_CustomEvent>(Node))
            return TEXT("custom_event");
        if (Cast<UK2Node_Event>(Node))
            return TEXT("event");
        if (Cast<UK2Node_FunctionEntry>(Node))
            return TEXT("function_entry");

        // ── Function calls ─────────────────────────────────
        // CallParentFunction inherits from CallFunction — specific first
        if (Cast<UK2Node_CallParentFunction>(Node))
            return TEXT("parent_call");
        if (Cast<UK2Node_CallFunction>(Node))
            return TEXT("function_call");

        // ── Variables ──────────────────────────────────────
        if (Cast<UK2Node_VariableGet>(Node))
            return TEXT("variable_get");
        if (Cast<UK2Node_VariableSet>(Node))
            return TEXT("variable_set");

        // ── Flow control ───────────────────────────────────
        if (Cast<UK2Node_IfThenElse>(Node))
            return TEXT("branch");
        if (Cast<UK2Node_ExecutionSequence>(Node))
            return TEXT("sequence");

        // ── Macro ──────────────────────────────────────────
        if (Cast<UK2Node_MacroInstance>(Node))
            return TEXT("macro_instance");

        // ── Casts ──────────────────────────────────────────
        // ClassDynamicCast inherits from DynamicCast; check subclass first.
        if (Cast<UK2Node_ClassDynamicCast>(Node))
            return TEXT("class_dynamic_cast");
        if (Cast<UK2Node_DynamicCast>(Node))
            return TEXT("dynamic_cast");

        // ── Tunnel / Literal ───────────────────────────────
        if (Cast<UK2Node_Tunnel>(Node))
            return TEXT("tunnel");
        if (Cast<UK2Node_Literal>(Node))
            return TEXT("literal");

        // ── Fallback ───────────────────────────────────────
        return TEXT("unknown");
    }

    // ── Node error state — E5b confirmed read ──────────────
    // Verified against the UE 5.7.4 UEdGraphNode error-state API.
    // Reads Node->ErrorType / Node->ErrorMsg.
    // Mapping: empty ErrorMsg → "none"; non-empty + EMessageSeverity::Error → "error";
    // non-empty + EMessageSeverity::Warning / PerformanceWarning → "warning";
    // other non-empty → "warning" fallback.
    void ReadNodeErrorState(const UEdGraphNode* Node, bool& bOutDisabled, FString& OutErrorType, FString& OutErrorMessage)
    {
        if (Node == nullptr)
        {
            bOutDisabled = false;
            OutErrorType = TEXT("none");
            OutErrorMessage.Empty();
            return;
        }

        bOutDisabled = !Node->IsNodeEnabled();

        OutErrorMessage = Node->ErrorMsg;
        if (OutErrorMessage.IsEmpty())
        {
            OutErrorType = TEXT("none");
            return;
        }

        int32 Severity = Node->ErrorType;
        if (Severity == EMessageSeverity::Error)
        {
            OutErrorType = TEXT("error");
        }
        else if (Severity == EMessageSeverity::Warning || Severity == EMessageSeverity::PerformanceWarning)
        {
            OutErrorType = TEXT("warning");
        }
        else
        {
            OutErrorType = TEXT("warning"); // fallback for non-empty messages
        }
    }

    // ── Find selected Blueprint ───────────────────────────────
    bool FindSelectedBlueprint(UBlueprint*& OutBP, FAssetData& OutAssetData)
    {
        OutBP = nullptr;

        if (GEditor == nullptr)
            return false;

        FContentBrowserModule& ContentBrowserModule =
            FModuleManager::LoadModuleChecked<FContentBrowserModule>(TEXT("ContentBrowser"));

        TArray<FAssetData> SelectedAssets;
        ContentBrowserModule.Get().GetSelectedAssets(SelectedAssets);

        if (SelectedAssets.Num() == 0)
            return false;

        for (const FAssetData& AssetData : SelectedAssets)
        {
            UObject* Asset = AssetData.GetAsset();
            if (Asset == nullptr)
                continue;

            OutBP = Cast<UBlueprint>(Asset);
            if (OutBP != nullptr)
            {
                OutAssetData = AssetData;
                return true;
            }
        }

        return false;
    }

} // anonymous namespace

// ═══════════════════════════════════════════════════════════════
// FindGraphByGraphId (K2b-2b helper — needs ClassifyGraphKind)
// ═══════════════════════════════════════════════════════════════

UEdGraph* OmueBlueprintStructureReadCollector::FindGraphByGraphId(
    UBlueprint* BP,
    const FString& GraphId,
    FString& OutKind)
{
    if (BP == nullptr)
        return nullptr;

    // UbergraphPages
    for (const TObjectPtr<UEdGraph>& Graph : BP->UbergraphPages)
    {
        if (Graph == nullptr) continue;
        FString Kind = ClassifyGraphKind(BP, TEXT("UbergraphPages"));
        FString Candidate = FString::Printf(
            TEXT("%s::%s"), *Kind, *Graph->GetName());
        if (Candidate == GraphId) { OutKind = Kind; return Graph.Get(); }
    }

    // FunctionGraphs
    for (UEdGraph* Graph : BP->FunctionGraphs)
    {
        if (Graph == nullptr) continue;
        FString Candidate = FString::Printf(
            TEXT("function::%s"), *Graph->GetName());
        if (Candidate == GraphId) { OutKind = TEXT("function"); return Graph; }
    }

    // MacroGraphs
    for (UEdGraph* Graph : BP->MacroGraphs)
    {
        if (Graph == nullptr) continue;
        FString Candidate = FString::Printf(
            TEXT("macro::%s"), *Graph->GetName());
        if (Candidate == GraphId) { OutKind = TEXT("macro"); return Graph; }
    }

    // DelegateSignatureGraphs
    for (const TObjectPtr<UEdGraph>& Graph : BP->DelegateSignatureGraphs)
    {
        if (Graph == nullptr) continue;
        FString Candidate = FString::Printf(
            TEXT("delegate::%s"), *Graph->GetName());
        if (Candidate == GraphId) { OutKind = TEXT("delegate"); return Graph.Get(); }
    }

    return nullptr;
}

// ═══════════════════════════════════════════════════════════════
// CollectAvailableGraphIds (K2b-2b helper — needs ClassifyGraphKind)
// ═══════════════════════════════════════════════════════════════

void OmueBlueprintStructureReadCollector::CollectAvailableGraphIds(
    UBlueprint* BP,
    TArray<FString>& OutIds)
{
    if (BP == nullptr) return;

    for (const TObjectPtr<UEdGraph>& G : BP->UbergraphPages)
    {
        if (G == nullptr) continue;
        FString K = ClassifyGraphKind(BP, TEXT("UbergraphPages"));
        OutIds.Add(FString::Printf(TEXT("%s::%s"), *K, *G->GetName()));
    }
    for (UEdGraph* G : BP->FunctionGraphs)
    {
        if (G == nullptr) continue;
        OutIds.Add(FString::Printf(TEXT("function::%s"), *G->GetName()));
    }
    for (UEdGraph* G : BP->MacroGraphs)
    {
        if (G == nullptr) continue;
        OutIds.Add(FString::Printf(TEXT("macro::%s"), *G->GetName()));
    }
    for (const TObjectPtr<UEdGraph>& G : BP->DelegateSignatureGraphs)
    {
        if (G == nullptr) continue;
        OutIds.Add(FString::Printf(TEXT("delegate::%s"), *G->GetName()));
    }
}

// ═══════════════════════════════════════════════════════════════
// BuildGraphInfo (K2b-2b helper — needs CountUniqueLinks)
// ═══════════════════════════════════════════════════════════════

void OmueBlueprintStructureReadCollector::BuildGraphInfo(
    const UEdGraph* Graph,
    const FString& Kind,
    bool bIsEntry,
    FOmueBPGraphInfo& OutInfo)
{
    if (Graph == nullptr) return;

    OutInfo.GraphId       = FString::Printf(TEXT("%s::%s"), *Kind, *Graph->GetName());
    OutInfo.Name          = Graph->GetName();
    OutInfo.Kind          = Kind;
    OutInfo.NodeCount     = Graph->Nodes.Num();
    OutInfo.LinkCount     = CountUniqueLinks(Graph);
    OutInfo.bIsEntryGraph = bIsEntry;
}

// ═══════════════════════════════════════════════════════════════
// TryGetGraphDetail — MAIN ENTRY POINT (K2b-2b)
// ═══════════════════════════════════════════════════════════════

bool OmueBlueprintStructureReadCollector::TryGetGraphDetail(
    const FString& RequestedGraphId,
    FOmueBPGraphDetailResult& OutDetail,
    TArray<FString>* OutAvailableGraphIds) const
{
    // ── 1. Find selected Blueprint ───────────────────────────
    UBlueprint* Blueprint = nullptr;
    FAssetData BlueprintAssetData;
    if (!FindSelectedBlueprint(Blueprint, BlueprintAssetData))
        return false;

    // ── 2. Collect available graphIds (always, for error msg) ─
    if (OutAvailableGraphIds != nullptr)
        CollectAvailableGraphIds(Blueprint, *OutAvailableGraphIds);

    // ── 3. Find the requested graph ──────────────────────────
    FString GraphKind;
    UEdGraph* TargetGraph = FindGraphByGraphId(Blueprint, RequestedGraphId, GraphKind);
    if (TargetGraph == nullptr)
        return false;

    // ═══════════════════════════════════════════════════════════
    // EXPORT META
    // ═══════════════════════════════════════════════════════════
    OutDetail.ExportMeta.FormatVersion = TEXT("0.1.0");
    OutDetail.ExportMeta.ExportedAt    = FDateTime::UtcNow().ToIso8601();
    OutDetail.ExportMeta.Source        = TEXT("live");
    OutDetail.ExportMeta.AssetPath     = BlueprintAssetData.GetObjectPathString();
    OutDetail.ExportMeta.IncludedGraphIds.Add(RequestedGraphId);

    OutDetail.BlueprintName    = BlueprintAssetData.AssetName.ToString();
    OutDetail.RequestedGraphId = RequestedGraphId;

    // ═══════════════════════════════════════════════════════════
    // GRAPH INFO
    // ═══════════════════════════════════════════════════════════
    bool bIsEntry = (GraphKind == TEXT("event")) &&
                    (TargetGraph->GetName() == TEXT("EventGraph"));
    BuildGraphInfo(TargetGraph, GraphKind, bIsEntry, OutDetail.Graph);

    OutDetail.Detail.GraphId = RequestedGraphId;

    // ═══════════════════════════════════════════════════════════
    // COLLECT NODES (with truncation)
    // ═══════════════════════════════════════════════════════════
    TArray<FOmueBPNodeInfo>& Nodes = OutDetail.Detail.Nodes;
    TMap<UEdGraphPin*, FString> PinIdMap;

    int32 TotalNodes = TargetGraph->Nodes.Num();
    int32 NodesToProcess = FMath::Min(TotalNodes, MaxNodesPerGraph);

    Nodes.Reserve(NodesToProcess);

    for (int32 NodeIdx = 0; NodeIdx < NodesToProcess; ++NodeIdx)
    {
        UEdGraphNode* Node = TargetGraph->Nodes[NodeIdx].Get();
        if (Node == nullptr) continue;

        FOmueBPNodeInfo NodeInfo;
        NodeInfo.NodeId   = FString::Printf(TEXT("node-%d"), NodeIdx);
        NodeInfo.NodeGuid = Node->NodeGuid.ToString();
        NodeInfo.NodeType = ClassifyNodeType(Node);

        // Title: GetNodeTitle(FullTitle) → fallback GetName
        {
            FText TitleText = Node->GetNodeTitle(ENodeTitleType::FullTitle);
            FString TitleStr = TitleText.ToString();
            if (TitleStr.IsEmpty())
                NodeInfo.Title = Node->GetName();
            else
                NodeInfo.Title = MoveTemp(TitleStr);
        }

        // Disabled and error state — confirmed via E5b evidence pack
        ReadNodeErrorState(Node, NodeInfo.bIsDisabled, NodeInfo.ErrorType, NodeInfo.ErrorMessage);

        // ── Annotations: position & comment ──────────────────
        {
            NodeInfo.NodePosX = Node->GetNodePosX();
            NodeInfo.NodePosY = Node->GetNodePosY();
            NodeInfo.bHasPosition = true; // UEdGraphNode always has a position
        }
        {
            NodeInfo.NodeComment = Node->NodeComment;
            NodeInfo.bCommentBubbleVisible = Node->bCommentBubbleVisible;
        }

        // ── Pins (uses Node->Pins, verified in K2b-1) ────────
        int32 TotalPins = Node->Pins.Num();
        int32 PinsToProcess = FMath::Min(TotalPins, MaxPinsPerNode);

        NodeInfo.Pins.Reserve(PinsToProcess);

        for (int32 PinIdx = 0; PinIdx < PinsToProcess; ++PinIdx)
        {
            UEdGraphPin* Pin = Node->Pins[PinIdx];
            if (Pin == nullptr) continue;

            FOmueBPPinInfo PinInfo;
            PinInfo.PinId       = FString::Printf(TEXT("%s.pin-%d"), *NodeInfo.NodeId, PinIdx);
            PinInfo.PinGuid     = Pin->PinId.ToString();
            PinInfo.Name        = Pin->PinName.ToString();
            PinInfo.Direction   = PinDirectionToString(Pin->Direction);
            PinInfo.PinKind     = ClassifyPinKind(Pin);
            PinInfo.DataType    = SerializePinType(Pin);
            PinInfo.PinCategory = Pin->PinType.PinCategory.ToString();
            PinInfo.bIsArray    = (Pin->PinType.ContainerType == EPinContainerType::Array);
            switch (Pin->PinType.ContainerType)
            {
            case EPinContainerType::None:  PinInfo.ContainerType = TEXT("none");  break;
            case EPinContainerType::Array: PinInfo.ContainerType = TEXT("array"); break;
            case EPinContainerType::Set:   PinInfo.ContainerType = TEXT("set");   break;
            case EPinContainerType::Map:   PinInfo.ContainerType = TEXT("map");   break;
            default:                       PinInfo.ContainerType = TEXT("none");  break;
            }
            PinInfo.bIsConnected = (Pin->LinkedTo.Num() > 0);

            // Register pin for link construction
            PinIdMap.Add(Pin, PinInfo.PinId);

            NodeInfo.Pins.Add(MoveTemp(PinInfo));
        }

        // Pin limit truncation warning
        if (TotalPins > MaxPinsPerNode)
        {
            if (!OutDetail.Detail.Truncation.bTruncated)
            {
                OutDetail.Detail.Truncation.bTruncated = true;
                OutDetail.Detail.Truncation.Reason = TEXT("pin_limit");
            }
            OutDetail.Detail.Truncation.Warnings.Add(
                FString::Printf(TEXT("Node '%s' has %d pins, returning first %d."),
                    *NodeInfo.Title, TotalPins, MaxPinsPerNode));
        }

        Nodes.Add(MoveTemp(NodeInfo));
    }

    // Node limit truncation
    if (TotalNodes > MaxNodesPerGraph)
    {
        OutDetail.Detail.Truncation.bTruncated = true;
        OutDetail.Detail.Truncation.Reason = TEXT("node_limit");
        OutDetail.Detail.Truncation.Warnings.Add(
            FString::Printf(TEXT("Graph has %d nodes, returning first %d."),
                TotalNodes, MaxNodesPerGraph));
    }

    // ═══════════════════════════════════════════════════════════
    // COLLECT LINKS (with dedup, from output pins only)
    // ═══════════════════════════════════════════════════════════
    TArray<FOmueBPLinkInfo>& Links = OutDetail.Detail.Links;
    TSet<FString> LinkDedupSet;
    TMap<FString, TArray<FString>> LinkedToMap;

    int32 LinkCount = 0;
    int32 TotalEdges = 0;

    for (UEdGraphNode* Node : TargetGraph->Nodes)
    {
        if (Node == nullptr) continue;

        for (UEdGraphPin* Pin : Node->Pins)
        {
            if (Pin == nullptr) continue;

            // Only emit links from output pins to avoid duplicates
            if (Pin->Direction != EGPD_Output) continue;

            for (UEdGraphPin* LinkedTo : Pin->LinkedTo)
            {
                if (LinkedTo == nullptr) continue;
                TotalEdges++;

                if (LinkCount >= MaxLinksPerGraph) break;

                // Dedup via pointer-pair key
                const void* A = static_cast<const void*>(Pin);
                const void* B = static_cast<const void*>(LinkedTo);
                FString PairKey = FString::Printf(TEXT("%p_%p"), A, B);

                bool bAlreadyInSet = false;
                LinkDedupSet.Add(PairKey, &bAlreadyInSet);
                if (bAlreadyInSet) continue;

                FString* SrcPinId = PinIdMap.Find(Pin);
                FString* TgtPinId = PinIdMap.Find(LinkedTo);
                if (SrcPinId == nullptr || TgtPinId == nullptr) continue;

                FOmueBPLinkInfo Link;
                Link.LinkId       = FString::Printf(TEXT("link-%d"), LinkCount);
                Link.SourcePinId  = *SrcPinId;
                Link.SourceNodeId = Link.SourcePinId.Left(
                    Link.SourcePinId.Find(TEXT(".")));
                Link.TargetPinId  = *TgtPinId;
                Link.TargetNodeId = Link.TargetPinId.Left(
                    Link.TargetPinId.Find(TEXT(".")));

                Links.Add(MoveTemp(Link));

                // Populate linkedTo on both pins (bidirectional for completeness)
                LinkedToMap.FindOrAdd(*SrcPinId).Add(*TgtPinId);
                LinkedToMap.FindOrAdd(*TgtPinId).Add(*SrcPinId);

                LinkCount++;
            }
        }
    }

    // Apply linkedTo to pins
    for (FOmueBPNodeInfo& NodeInfo : Nodes)
    {
        for (FOmueBPPinInfo& PinInfo : NodeInfo.Pins)
        {
            if (TArray<FString>* Targets = LinkedToMap.Find(PinInfo.PinId))
                PinInfo.LinkedTo = *Targets;
        }
    }

    // Link limit truncation
    if (TotalEdges > MaxLinksPerGraph)
    {
        OutDetail.Detail.Truncation.bTruncated = true;
        if (OutDetail.Detail.Truncation.Reason.IsEmpty())
            OutDetail.Detail.Truncation.Reason = TEXT("link_limit");
        OutDetail.Detail.Truncation.Warnings.Add(
            FString::Printf(TEXT("Graph has approximately %d link edges, "
                "returning first %d after dedup."),
                TotalEdges, MaxLinksPerGraph));
    }

    return true;
}
