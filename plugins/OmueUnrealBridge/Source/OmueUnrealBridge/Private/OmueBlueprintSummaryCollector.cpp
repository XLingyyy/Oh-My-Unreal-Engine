// Copyright OMUE. All Rights Reserved.
//
// K2a — UE 5.7.4 API:
//   FContentBrowserModule::Get().GetSelectedAssets() → TArray<FAssetData>
//   FAssetData::GetAsset() → UObject* (loads asset)
//   Cast<UBlueprint> → access top-level metadata
//   UBlueprint::UbergraphPages / FunctionGraphs / MacroGraphs → TArray<TObjectPtr<UEdGraph>>
//   UBlueprint::BlueprintsImplementingInterface / BlueprintsDerivedFrom
//   UBlueprint::NewVariables → TArray<FBPVariableDescription>
//   UBlueprint::ParentClass / GeneratedClass / SkeletonGeneratedClass
//   UBlueprint::BlueprintType → EBlueprintType
//   UBlueprint::Status → TEnumAsByte<EBlueprintStatus>
//
// Explicitly NOT doing:
//   - UEdGraph::Nodes traversal
//   - UEdGraphNode / UEdGraphPin access
//   - Asset modification (Modify, MarkPackageDirty, SavePackage)
//   - Blueprint compilation
//   - AssetRegistry scanning
//   - PIE / Automation Tests
//   - UBlueprintGeneratedClass::bIsDataOnly (does not exist in UE 5.7.4 headers)

#include "OmueBlueprintSummaryCollector.h"

#include "Editor.h"
#include "ContentBrowserModule.h"
#include "IContentBrowserSingleton.h"
#include "AssetRegistry/AssetData.h"

#include "Engine/Blueprint.h"
#include "EdGraph/EdGraph.h"

#include "UObject/Package.h"

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

    /** Derive graph kind from which top-level array it came from. */
    const TCHAR* GraphKindFromSource(const FString& Source)
    {
        if (Source == TEXT("UbergraphPages"))  return TEXT("event");
        if (Source == TEXT("FunctionGraphs"))  return TEXT("function");
        if (Source == TEXT("MacroGraphs"))     return TEXT("macro");
        return TEXT("event");
    }
}

// ═══════════════════════════════════════════════════════════════
// Single public method
// ═══════════════════════════════════════════════════════════════

bool OmueBlueprintSummaryCollector::TryGetBlueprintSummary(
    FOmueBlueprintSummary& OutSummary) const
{
    if (GEditor == nullptr)
    {
        return false;
    }

    FContentBrowserModule& ContentBrowserModule =
        FModuleManager::LoadModuleChecked<FContentBrowserModule>(TEXT("ContentBrowser"));

    TArray<FAssetData> SelectedAssets;
    ContentBrowserModule.Get().GetSelectedAssets(SelectedAssets);

    if (SelectedAssets.Num() == 0)
    {
        return false;
    }

    // ── Find the first Blueprint in the selection ──────────────
    // FAssetData::GetAsset() loads the package into memory.
    // This is a read-only operation — no modification, no compilation.
    // Iterate in order to find the first cast-able Blueprint,
    // not just check SelectedAssets[0].
    UBlueprint* Blueprint = nullptr;
    FAssetData BlueprintAssetData;

    for (const FAssetData& AssetData : SelectedAssets)
    {
        UObject* Asset = AssetData.GetAsset();
        if (Asset == nullptr)
        {
            continue;
        }

        Blueprint = Cast<UBlueprint>(Asset);
        if (Blueprint != nullptr)
        {
            BlueprintAssetData = AssetData;
            break;
        }
    }

    if (Blueprint == nullptr)
    {
        // No Blueprint found in the selection.
        return false;
    }

    // ── Basic identity ─────────────────────────────────────────
    OutSummary.Name        = BlueprintAssetData.AssetName.ToString();
    OutSummary.PackagePath = BlueprintAssetData.PackageName.ToString();
    OutSummary.ObjectPath  = BlueprintAssetData.GetObjectPathString();
    OutSummary.AssetClass  = BlueprintAssetData.AssetClassPath.GetAssetName().ToString();

    // ── Parent class ───────────────────────────────────────────
    if (Blueprint->ParentClass != nullptr)
    {
        OutSummary.ParentClassName = Blueprint->ParentClass->GetName();
    }

    // ── Generated / skeleton class ─────────────────────────────
    if (Blueprint->GeneratedClass != nullptr)
    {
        OutSummary.GeneratedClassName = Blueprint->GeneratedClass->GetName();
    }
    if (Blueprint->SkeletonGeneratedClass != nullptr)
    {
        OutSummary.SkeletonClassName = Blueprint->SkeletonGeneratedClass->GetName();
    }

    // ── Blueprint type ─────────────────────────────────────────
    OutSummary.BlueprintType = BlueprintTypeToString(Blueprint->BlueprintType);

    // ── Compile status ─────────────────────────────────────────
    OutSummary.Status = BlueprintStatusToString(Blueprint->Status);

    // ── Data-only check ────────────────────────────────────────
    // K2a does not implement precise data-only detection.
    // UE 5.7.4 BlueprintGeneratedClass.h does not contain bIsDataOnly,
    // and no reliable read-only API was confirmed in the available headers.
    // Conservatively return false until a verified API is identified.
    OutSummary.bIsDataOnly = false;

    // ── Dirty check ────────────────────────────────────────────
    {
        UPackage* Pkg = Blueprint->GetOutermost();
        if (Pkg != nullptr)
        {
            OutSummary.bIsDirty = Pkg->IsDirty();
        }
    }

    // ── Graphs (name + kind only — NO UEdGraph::Nodes access) ──
    // UE 5.7.4: UbergraphPages / FunctionGraphs / MacroGraphs are
    // TArray<TObjectPtr<UEdGraph>>. Use a generic lambda to avoid
    // hard-coding the element type.
    {
        auto CollectGraphs = [&](const auto& GraphArray, const TCHAR* Source)
        {
            for (const auto& Graph : GraphArray)
            {
                if (Graph == nullptr)
                {
                    continue;
                }
                FOmueGraphSummary G;
                G.Name = Graph->GetName();
                G.Kind = GraphKindFromSource(Source);
                OutSummary.Graphs.Add(G);
            }
        };

        CollectGraphs(Blueprint->UbergraphPages, TEXT("UbergraphPages"));
        CollectGraphs(Blueprint->FunctionGraphs, TEXT("FunctionGraphs"));
        CollectGraphs(Blueprint->MacroGraphs,    TEXT("MacroGraphs"));

        OutSummary.GraphCount = OutSummary.Graphs.Num();
    }

    // ── Variables (name + type category only) ──────────────────
    {
        for (const FBPVariableDescription& Var : Blueprint->NewVariables)
        {
            FOmueVariableSummary V;
            V.Name     = Var.VarName.ToString();
            V.Category = Var.VarType.PinCategory.ToString();
            OutSummary.Variables.Add(V);
        }
        OutSummary.VariableCount = OutSummary.Variables.Num();
    }

    // ── Functions (name-level from FunctionGraphs) ─────────────
    {
        for (const auto& Graph : Blueprint->FunctionGraphs)
        {
            if (Graph == nullptr)
            {
                continue;
            }
            FOmueFunctionSummary F;
            F.Name = Graph->GetName();
            OutSummary.Functions.Add(F);
        }
        OutSummary.FunctionCount = OutSummary.Functions.Num();
    }

    // ── Macros (name-level from MacroGraphs) ───────────────────
    {
        for (const auto& Graph : Blueprint->MacroGraphs)
        {
            if (Graph == nullptr)
            {
                continue;
            }
            FOmueMacroSummary M;
            M.Name = Graph->GetName();
            OutSummary.Macros.Add(M);
        }
        OutSummary.MacroCount = OutSummary.Macros.Num();
    }

    return true;
}
