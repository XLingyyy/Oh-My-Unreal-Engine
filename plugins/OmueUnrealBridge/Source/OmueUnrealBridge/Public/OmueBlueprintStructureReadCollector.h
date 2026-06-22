// Copyright OMUE. All Rights Reserved.
//
// READ-ONLY COLLECTOR — KISMET & BLUEPRINTGRAPH ACCESS ALLOWED.
// This collector reads Blueprint graph structure for read-only summary.
// - Do NOT call FKismetEditorUtilities::CompileBlueprint() or any compile-triggering API.
// - Do NOT modify UBlueprint, UEdGraph, UEdGraphNode, or UEdGraphPin.
// - Do NOT call MarkPackageDirty(), SavePackage(), or any write operation.
// - K2b-1: graph summary only — nodeCount/linkCount/isEntryGraph. No node/pin/link detail arrays.

#pragma once

#include "CoreMinimal.h"

// ── Export meta ─────────────────────────────────────────────────

struct FOmueBPExportMeta
{
    FString FormatVersion;
    FString ExportedAt;
    FString Source;
    FString AssetPath;
    TArray<FString> IncludedGraphIds; // empty in K2b-1
};

// ── Per-graph summary ───────────────────────────────────────────

struct FOmueBPGraphInfo
{
    /** graphId — format "{kind}::{name}", stable within this export only */
    FString GraphId;
    FString Name;
    FString Kind;  // "event"|"function"|"macro"|"interface"|"delegate"|"custom"|"unknown"
    int32 NodeCount = 0;
    int32 LinkCount = 0;
    bool bIsEntryGraph = false;
};

// ── Variable definition ────────────────────────────────────────

struct FOmueBPVariableInfo
{
    FString Name;
    FString Type;
    FString Category;
    bool bIsEditable = false;
    bool bIsExposed = false;
    bool bIsArray = false;
    FString DefaultValue; // empty string if no default
};

// ── Function param ─────────────────────────────────────────────

struct FOmueBPParamInfo
{
    FString Name;
    FString Type;
    bool bIsReturnValue = false;
    bool bIsReference = false;
    bool bIsArray = false;
};

// ── Function definition ─────────────────────────────────────────

struct FOmueBPFunctionInfo
{
    FString Name;
    FString GraphId;
    bool bIsOverride = false;
    bool bIsPure = false;
    bool bIsConst = false;
    TArray<FOmueBPParamInfo> InputParams;
    TArray<FOmueBPParamInfo> OutputParams;
    int32 NodeCount = 0;
};

// ── Event definition ────────────────────────────────────────────

struct FOmueBPEventInfo
{
    FString Name;
    FString EventType;
    FString GraphId;
    int32 NodeCount = 0; // node count of the owning graph
};

// ── Macro definition ────────────────────────────────────────────

struct FOmueBPMacroInfo
{
    FString Name;
    FString GraphId;
    int32 NodeCount = 0;
};

// ── Top-level structure summary ─────────────────────────────────

struct FOmueBPStructureSummary
{
    FOmueBPExportMeta ExportMeta;
    // ── Blueprint metadata ──
    FString Name;
    FString PackagePath;
    FString ObjectPath;
    FString AssetClass;
    FString ParentClassName;
    FString GeneratedClassName;
    FString SkeletonClassName;
    FString BlueprintType;
    FString Status;
    bool bIsDataOnly = false;
    bool bIsDirty = false;
    int32 GraphCount = 0;
    int32 VariableCount = 0;
    int32 FunctionCount = 0;
    int32 EventCount = 0;
    int32 MacroCount = 0;
    int32 TotalNodeCount = 0;
    int32 TotalLinkCount = 0;
    // ── Lists ──
    TArray<FOmueBPGraphInfo> Graphs;
    TArray<FOmueBPVariableInfo> Variables;
    TArray<FOmueBPFunctionInfo> Functions;
    TArray<FOmueBPEventInfo> Events;
    TArray<FOmueBPMacroInfo> Macros;
};

// ── K2b-2b: Single-graph node/pin/link detail structs ──────────────

struct FOmueBPNodeInfo
{
    FString NodeId;
    FString NodeGuid;
    FString Title;
    FString NodeType;
    TArray<struct FOmueBPPinInfo> Pins;
    bool bIsDisabled = false;
    FString ErrorType;
    FString ErrorMessage;
    // ── Annotations ──
    int32 NodePosX = 0;
    int32 NodePosY = 0;
    bool bHasPosition = false;
    FString NodeComment;
    bool bCommentBubbleVisible = false;
};

struct FOmueBPPinInfo
{
    FString PinId;
    FString PinGuid;
    FString Name;
    FString Direction;
    FString PinKind;
    FString DataType;
    FString PinCategory;
    bool bIsArray = false;
    bool bIsConnected = false;
    TArray<FString> LinkedTo;
    FString ContainerType; // "none" | "array" | "set" | "map"
};

struct FOmueBPLinkInfo
{
    FString LinkId;
    FString SourcePinId;
    FString SourceNodeId;
    FString TargetPinId;
    FString TargetNodeId;
};

struct FOmueBPGraphDetailTruncation
{
    bool bTruncated = false;
    FString Reason;
    TArray<FString> Warnings;
};

struct FOmueBPGraphDetail
{
    FString GraphId;
    TArray<FOmueBPNodeInfo> Nodes;
    TArray<FOmueBPLinkInfo> Links;
    FOmueBPGraphDetailTruncation Truncation;
};

struct FOmueBPGraphDetailResult
{
    FOmueBPExportMeta ExportMeta;
    FString BlueprintName;
    FString RequestedGraphId;
    FOmueBPGraphInfo Graph;
    FOmueBPGraphDetail Detail;
};

/**
 * Read-only collector for Blueprint graph structure (K2b-1 summary + K2b-2b detail).
 *
 * K2b-1: TryGetBlueprintStructure() — graph-level summary (nodeCount/linkCount per graph).
 * K2b-2b: TryGetGraphDetail() — single-graph node/pin/link detail export.
 *
 * Reads Content Browser selection, finds the first Blueprint, and collects
 * graph structure. Does NOT modify any UE asset. Does NOT export default values.
 *
 * Independent from OmueBlueprintSummaryCollector — K2a collector unchanged.
 */
class OmueBlueprintStructureReadCollector
{
public:
    OmueBlueprintStructureReadCollector() = default;
    ~OmueBlueprintStructureReadCollector() = default;

    // Non-copyable, non-movable.
    OmueBlueprintStructureReadCollector(const OmueBlueprintStructureReadCollector&) = delete;
    OmueBlueprintStructureReadCollector& operator=(const OmueBlueprintStructureReadCollector&) = delete;

    /**
     * Try to collect graph structure summary for the first selected Blueprint.
     *
     * @param OutSummary  Filled with Blueprint structure summary on success.
     * @return true if a Blueprint was selected and summary is valid.
     */
    bool TryGetBlueprintStructure(FOmueBPStructureSummary& OutSummary) const;

    /**
     * Try to collect single-graph node/pin/link detail for the first selected Blueprint.
     *
     * @param RequestedGraphId  graphId in "{kind}::{name}" format.
     * @param OutDetail         Filled with graph detail on success.
     * @param OutAvailableGraphIds  If non-null, filled with all available graphIds
     *                              from the selected Blueprint (for error messages).
     * @return true if the Blueprint and graphId were found and detail was collected.
     *         false if no Blueprint selected, non-Blueprint selected, or graphId not found.
     */
    bool TryGetGraphDetail(
        const FString& RequestedGraphId,
        FOmueBPGraphDetailResult& OutDetail,
        TArray<FString>* OutAvailableGraphIds = nullptr) const;

private:
    static FString ClassifyGraphKind(const class UBlueprint* BP, const TCHAR* Source);
    static int32 CountUniqueLinks(const class UEdGraph* Graph);
    static void CollectEventsFromGraph(
        const class UEdGraph* Graph,
        const FString& GraphId,
        int32 GraphNodeCount,
        TArray<FOmueBPEventInfo>& OutEvents);
    static bool CollectFunctionInfo(
        const class UBlueprint* BP,
        const class UEdGraph* Graph,
        const FString& Kind,
        FOmueBPFunctionInfo& OutFunc);
    static bool CollectVariableInfo(
        const struct FBPVariableDescription& VarDesc,
        FOmueBPVariableInfo& OutVar);

    // K2b-2b: graph detail helpers that need access to ClassifyGraphKind / CountUniqueLinks.
    static class UEdGraph* FindGraphByGraphId(class UBlueprint* BP, const FString& GraphId, FString& OutKind);
    static void CollectAvailableGraphIds(class UBlueprint* BP, TArray<FString>& OutIds);
    static void BuildGraphInfo(const class UEdGraph* Graph, const FString& Kind, bool bIsEntry, FOmueBPGraphInfo& OutInfo);
};
