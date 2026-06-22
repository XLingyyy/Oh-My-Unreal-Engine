// Copyright OMUE. All Rights Reserved.
//
// E62 — Read-only Behavior Tree / Blackboard diagnostic collector.
//
// UE 5.7.4 AIModule API (header-confirmed):
//   UBehaviorTree::RootNode              → UBTCompositeNode*
//   UBehaviorTree::BlackboardAsset       → UBlackboardData*
//   UBTNode::NodeName                     → FName
//   UBTNode::GetNodeName()                → FString
//   UBTCompositeNode::Children            → TArray<FBTCompositeChild>
//   FBTCompositeChild::ChildComposite     → TObjectPtr<UBTCompositeNode>
//   FBTCompositeChild::ChildTask          → TObjectPtr<UBTTaskNode>
//   FBTCompositeChild::Decorators         → TArray<TObjectPtr<UBTDecorator>>
//   FBTCompositeChild::DecoratorOps       → TArray<FBTDecoratorLogic>
//   UBlackboardData::Parent               → UBlackboardData*
//   UBlackboardData::ParentKeys           → TArray<FBlackboardEntry>
//   UBlackboardData::Keys                 → TArray<FBlackboardEntry>
//   FBlackboardEntry::EntryName           → FName
//   FBlackboardEntry::EntryDescription    → FString  (editor-only)
//   FBlackboardEntry::EntryCategory       → FString  (editor-only)
//   FBlackboardEntry::KeyType             → TObjectPtr<UBlackboardKeyType>
//   FBlackboardEntry::bInstanceSynced     → bool
//
// Read-only: uses LoadObject() to find assets, never calls Modify(),
// MarkPackageDirty(), PostEditChange(), or SavePackage().

#pragma once

#include "CoreMinimal.h"

// Forward declarations — full includes are in the .cpp.
class UBehaviorTree;
class UBTCompositeNode;
class UBTNode;

// ── Internal diagnostic data structures ──────────────────────────
// Plain C++ structs (no USTRUCT/UCLASS reflection).
// Used for read-only collection from BehaviorTree / Blackboard assets.
// All fields are populated by OmueBehaviorTreeReadCollector.

struct FOmueBtNodeEntry
{
    FString NodeId;
    FString NodeName;
    FString NodeKind;
    FString ClassName;
    FString ParentNodeId;
    TArray<FString> ChildNodeIds;
};

struct FOmueBbKeyDefinition
{
    FString KeyName;
    FString KeyType;
    bool bInstanceSynced = false;
};

struct FOmueBtDiagWarning
{
    FString Type;
    FString Message;
};

struct FOmueBehaviorTreeDiagnostic
{
    FString AssetName;
    FString AssetPath;
    FString Source;
    FString Timestamp;
    FString RootNodeId;
    FString RootNodeName;
    TArray<FString> TopLevelNodeIds;
    FString BlackboardAssetName;
    FString BlackboardAssetPath;
    TArray<FOmueBtNodeEntry> NodeHierarchy;
    TArray<FOmueBbKeyDefinition> BlackboardKeys;
    int32 NodeCount = 0;
    int32 BbKeyCount = 0;
    TArray<FOmueBtDiagWarning> Warnings;
};

/**
 * Read-only collector that loads a UBehaviorTree and UBlackboardData
 * at a given asset path and produces a diagnostic structure.
 *
 * No asset writes. No PIE/world context. No AI controller access.
 */
class OmueBehaviorTreeReadCollector
{
public:
    OmueBehaviorTreeReadCollector() = default;
    ~OmueBehaviorTreeReadCollector() = default;

    OmueBehaviorTreeReadCollector(const OmueBehaviorTreeReadCollector&) = delete;
    OmueBehaviorTreeReadCollector& operator=(const OmueBehaviorTreeReadCollector&) = delete;

    /**
     * Collect BT/BB diagnostic at the given asset path.
     *
     * @param AssetPath  Full UE asset path, e.g. "/Game/AI/BT_MonsterAI".
     * @param OutJson    Filled with JSON string on success, empty on failure.
     * @param OutError   Human-readable error message on failure.
     * @return true if the BT asset was found and diagnostic was collected.
     */
    bool TryCollect(const FString& AssetPath, FString& OutJson, FString& OutError) const;

private:
    /** Recursively walk composite node children to collect the node hierarchy. */
    void WalkCompositeChildren(
        const UBTCompositeNode* Composite,
        const FString& ParentNodeId,
        FOmueBehaviorTreeDiagnostic& OutDiag,
        TMap<const void*, FString>& PointerToNodeId) const;

    /** Add a single node entry to the diagnostic, deduplicating by pointer. */
    FString AddNodeEntry(
        const UBTNode* Node,
        const FString& NodeKind,
        const FString& ParentNodeId,
        FOmueBehaviorTreeDiagnostic& OutDiag,
        TMap<const void*, FString>& PointerToNodeId) const;
};
