// Copyright OMUE. All Rights Reserved.
//
// E62 — Read-only Behavior Tree / Blackboard diagnostic collector.
//
// UE 5.7.4 AIModule header-confirmed API — see .h for full list.
// Read-only: LoadObject() only, no Modify/MarkPackageDirty/SavePackage.
// No PIE/world context. No AI controller.

#include "OmueBehaviorTreeReadCollector.h"

#include "BehaviorTree/BehaviorTree.h"
#include "BehaviorTree/BehaviorTreeTypes.h"
#include "BehaviorTree/BTNode.h"
#include "BehaviorTree/BTCompositeNode.h"
#include "BehaviorTree/BTTaskNode.h"
#include "BehaviorTree/BTDecorator.h"
#include "BehaviorTree/BTService.h"
#include "BehaviorTree/BlackboardData.h"
#include "BehaviorTree/Blackboard/BlackboardKeyType.h"

#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Serialization/JsonWriter.h"
#include "Serialization/JsonSerializer.h"
#include "Misc/DateTime.h"
#include "UObject/UObjectIterator.h"

// ── Helpers ──────────────────────────────────────────────────────

namespace
{
    /** Format an object pointer as a hex node ID string. */
    FString PtrToNodeId(const void* Ptr)
    {
        if (!Ptr) return TEXT("");
        return FString::Printf(TEXT("0x%llx"), (int64)Ptr);
    }

    /** Determine node kind string from a UBTNode-derived class. */
    FString ClassToNodeKind(const UBTNode* Node)
    {
        if (!Node) return TEXT("Task"); // fallback

        if (Node->IsA<UBTCompositeNode>())
        {
            // The root node is always a composite — we mark it Root if it
            // is the top-level root of the tree (caller decides that).
            return TEXT("Composite");
        }
        if (Node->IsA<UBTDecorator>())  return TEXT("Decorator");
        if (Node->IsA<UBTService>())    return TEXT("Service");
        if (Node->IsA<UBTTaskNode>())   return TEXT("Task");

        return TEXT("Task");
    }

    /** Get class display name for a UObject. */
    FString GetClassName(const UObject* Obj)
    {
        if (!Obj) return TEXT("");
        return Obj->GetClass()->GetName();
    }

    /** Get key type display name from a UBlackboardKeyType. */
    FString KeyTypeToString(const UBlackboardKeyType* KeyType)
    {
        if (!KeyType) return TEXT("None");
        return KeyType->GetClass()->GetName();
    }

    /** Serialize a node entry to a JSON value. */
    TSharedPtr<FJsonValueObject> NodeEntryToJson(
        const FString& NodeId,
        const FString& NodeName,
        const FString& NodeKind,
        const FString& ClassName,
        const FString& ParentNodeId,
        const TArray<FString>& ChildNodeIds)
    {
        TSharedPtr<FJsonObject> Obj = MakeShareable(new FJsonObject);
        Obj->SetStringField(TEXT("nodeId"), NodeId);
        Obj->SetStringField(TEXT("nodeName"), NodeName);
        Obj->SetStringField(TEXT("nodeKind"), NodeKind);
        Obj->SetStringField(TEXT("className"), ClassName);
        Obj->SetStringField(TEXT("parentNodeId"), ParentNodeId);

        TArray<TSharedPtr<FJsonValue>> ChildArr;
        for (const FString& Cid : ChildNodeIds)
        {
            ChildArr.Add(MakeShareable(new FJsonValueString(Cid)));
        }
        Obj->SetArrayField(TEXT("childNodeIds"), ChildArr);

        return MakeShareable(new FJsonValueObject(Obj));
    }
} // namespace

// ── Recursive walk helpers ──────────────────────────────────────

void OmueBehaviorTreeReadCollector::WalkCompositeChildren(
    const UBTCompositeNode* Composite,
    const FString& ParentNodeId,
    FOmueBehaviorTreeDiagnostic& OutDiag,
    TMap<const void*, FString>& PointerToNodeId) const
{
    if (!Composite) return;

    for (const FBTCompositeChild& Child : Composite->Children)
    {
        // ── Decorators on this child entry ──
        for (const TObjectPtr<UBTDecorator>& Decorator : Child.Decorators)
        {
            if (!Decorator) continue;
            const FString DecId = AddNodeEntry(
                Decorator.Get(), TEXT("Decorator"), ParentNodeId,
                OutDiag, PointerToNodeId);

            // Decorators own nothing directly in the tree walk.
        }

        // ── Child composite ──
        if (Child.ChildComposite)
        {
            UBTCompositeNode* SubComposite = Child.ChildComposite.Get();
            const FString SubId = AddNodeEntry(
                SubComposite, TEXT("Composite"), ParentNodeId,
                OutDiag, PointerToNodeId);

            // Recurse into sub-composite
            WalkCompositeChildren(SubComposite, SubId, OutDiag, PointerToNodeId);
        }

        // ── Child task ──
        if (Child.ChildTask)
        {
            UBTTaskNode* Task = Child.ChildTask.Get();
            AddNodeEntry(Task, TEXT("Task"), ParentNodeId,
                         OutDiag, PointerToNodeId);

            // Tasks have no children in the BT hierarchy.
        }
    }
}

FString OmueBehaviorTreeReadCollector::AddNodeEntry(
    const UBTNode* Node,
    const FString& NodeKind,
    const FString& ParentNodeId,
    FOmueBehaviorTreeDiagnostic& OutDiag,
    TMap<const void*, FString>& PointerToNodeId) const
{
    if (!Node) return TEXT("");

    const void* Ptr = (const void*)Node;

    // Already visited? still record as child reference but return existing ID
    if (PointerToNodeId.Contains(Ptr))
    {
        return PointerToNodeId[Ptr];
    }

    const FString NodeId = PtrToNodeId(Ptr);
    PointerToNodeId.Add(Ptr, NodeId);

    FOmueBtNodeEntry Entry;
    Entry.NodeId = NodeId;
    Entry.NodeName = Node->GetNodeName();
    Entry.NodeKind = NodeKind;
    Entry.ClassName = GetClassName(Node);
    Entry.ParentNodeId = ParentNodeId;

    // ChildNodeIds will be filled during WalkCompositeChildren.

    OutDiag.NodeHierarchy.Add(MoveTemp(Entry));
    OutDiag.NodeCount++;

    return NodeId;
}

// ── Main collection logic ───────────────────────────────────────

bool OmueBehaviorTreeReadCollector::TryCollect(
    const FString& AssetPath, FString& OutJson, FString& OutError) const
{
    OutJson.Empty();
    OutError.Empty();

    // ── 1. Load the BehaviorTree asset (read-only) ──
    UBehaviorTree* BT = LoadObject<UBehaviorTree>(nullptr, *AssetPath);
    if (!BT)
    {
        OutError = FString::Printf(TEXT("BehaviorTree asset not found at path: %s"), *AssetPath);
        return false;
    }

    FOmueBehaviorTreeDiagnostic Diag;
    Diag.AssetName = BT->GetName();
    Diag.AssetPath = AssetPath;
    Diag.Source = TEXT("OmueBehaviorTreeReadCollector v1");
    Diag.Timestamp = FDateTime::UtcNow().ToIso8601();

    TMap<const void*, FString> PointerToNodeId;

    // ── 2. Process root composite ──
    if (BT->RootNode)
    {
        // The root is always a composite — mark it as "Root"
        const FString RootNodeId = AddNodeEntry(
            BT->RootNode, TEXT("Root"), /*ParentNodeId*/ TEXT(""),
            Diag, PointerToNodeId);

        Diag.RootNodeId = RootNodeId;
        Diag.RootNodeName = BT->RootNode->GetNodeName();
        Diag.TopLevelNodeIds.Add(RootNodeId);

        // Walk children
        WalkCompositeChildren(BT->RootNode, RootNodeId, Diag, PointerToNodeId);
    }
    else
    {
        Diag.Warnings.Add({
            TEXT("empty_tree"),
            TEXT("BehaviorTree has no RootNode (empty tree).")
        });
    }

    // ── 3. Process BlackboardData ──
    if (BT->BlackboardAsset)
    {
        UBlackboardData* BB = BT->BlackboardAsset;
        Diag.BlackboardAssetName = BB->GetName();
        Diag.BlackboardAssetPath = BB->GetPathName();

        // Collect keys: walk the parent chain to collect inherited keys first,
        // then child keys (mimicking GetKeys() behavior without runtime dependency).
        TArray<const UBlackboardData*> BBChain;
        {
            const UBlackboardData* Cur = BB;
            while (Cur)
            {
                BBChain.Add(Cur);
                Cur = Cur->Parent;
            }
            // Reverse: parent-first order
            Algo::Reverse(BBChain);
        }

        TSet<FName> SeenKeys;
        for (const UBlackboardData* Link : BBChain)
        {
            if (!Link) continue;

            for (const FBlackboardEntry& Entry : Link->Keys)
            {
                if (SeenKeys.Contains(Entry.EntryName))
                    continue;
                SeenKeys.Add(Entry.EntryName);

                FOmueBbKeyDefinition K;
                K.KeyName = Entry.EntryName.ToString();
                K.KeyType = Entry.KeyType
                    ? KeyTypeToString(Entry.KeyType.Get())
                    : TEXT("None");
                K.bInstanceSynced = Entry.bInstanceSynced;
                Diag.BlackboardKeys.Add(MoveTemp(K));
                Diag.BbKeyCount++;
            }
        }
    }
    else
    {
        Diag.Warnings.Add({
            TEXT("missing_blackboard"),
            TEXT("BehaviorTree has no BlackboardAsset assigned.")
        });
    }

    // ── 4. Serialize to JSON ──
    TSharedPtr<FJsonObject> RootObj = MakeShareable(new FJsonObject);

    // ── Asset info ──
    TSharedPtr<FJsonObject> AssetObj = MakeShareable(new FJsonObject);
    AssetObj->SetStringField(TEXT("assetName"), Diag.AssetName);
    AssetObj->SetStringField(TEXT("assetPath"), Diag.AssetPath);
    AssetObj->SetStringField(TEXT("rootNodeId"), Diag.RootNodeId);
    AssetObj->SetStringField(TEXT("rootNodeName"), Diag.RootNodeName);
    AssetObj->SetStringField(TEXT("blackboardAssetName"), Diag.BlackboardAssetName);
    AssetObj->SetStringField(TEXT("blackboardAssetPath"), Diag.BlackboardAssetPath);
    RootObj->SetObjectField(TEXT("asset"), AssetObj);

    // ── Node hierarchy ──
    // Need to fill childNodeIds by scanning parent references.
    // Build child collections first.
    TMap<FString, TArray<FString>> ParentToChildren;
    for (const FOmueBtNodeEntry& Entry : Diag.NodeHierarchy)
    {
        if (!Entry.ParentNodeId.IsEmpty())
        {
            ParentToChildren.FindOrAdd(Entry.ParentNodeId).Add(Entry.NodeId);
        }
    }
    // Apply to entries
    TArray<TSharedPtr<FJsonValue>> NodeArr;
    for (FOmueBtNodeEntry& Entry : const_cast<FOmueBehaviorTreeDiagnostic&>(Diag).NodeHierarchy)
    {
        if (ParentToChildren.Contains(Entry.NodeId))
        {
            Entry.ChildNodeIds = ParentToChildren[Entry.NodeId];
        }
        NodeArr.Add(NodeEntryToJson(
            Entry.NodeId, Entry.NodeName, Entry.NodeKind,
            Entry.ClassName, Entry.ParentNodeId, Entry.ChildNodeIds));
    }
    RootObj->SetArrayField(TEXT("nodeHierarchy"), NodeArr);

    // ── Blackboard keys ──
    TArray<TSharedPtr<FJsonValue>> KeyArr;
    for (const FOmueBbKeyDefinition& K : Diag.BlackboardKeys)
    {
        TSharedPtr<FJsonObject> KObj = MakeShareable(new FJsonObject);
        KObj->SetStringField(TEXT("keyName"), K.KeyName);
        KObj->SetStringField(TEXT("keyType"), K.KeyType);
        KObj->SetBoolField(TEXT("bInstanceSynced"), K.bInstanceSynced);
        KeyArr.Add(MakeShareable(new FJsonValueObject(KObj)));
    }
    RootObj->SetArrayField(TEXT("blackboardKeys"), KeyArr);

    // ── Counts ──
    RootObj->SetNumberField(TEXT("nodeCount"), Diag.NodeCount);
    RootObj->SetNumberField(TEXT("bbKeyCount"), Diag.BbKeyCount);

    // ── Warnings ──
    TArray<TSharedPtr<FJsonValue>> WarnArr;
    for (const FOmueBtDiagWarning& W : Diag.Warnings)
    {
        TSharedPtr<FJsonObject> WObj = MakeShareable(new FJsonObject);
        WObj->SetStringField(TEXT("type"), W.Type);
        WObj->SetStringField(TEXT("message"), W.Message);
        WarnArr.Add(MakeShareable(new FJsonValueObject(WObj)));
    }
    RootObj->SetArrayField(TEXT("warnings"), WarnArr);

    // ── Meta ──
    RootObj->SetStringField(TEXT("source"), Diag.Source);
    RootObj->SetStringField(TEXT("timestamp"), Diag.Timestamp);

    // ── Serialize ──
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&OutJson);
    if (!FJsonSerializer::Serialize(RootObj.ToSharedRef(), Writer))
    {
        OutError = TEXT("Failed to serialize BT diagnostic JSON.");
        OutJson.Empty();
        return false;
    }

    return true;
}
