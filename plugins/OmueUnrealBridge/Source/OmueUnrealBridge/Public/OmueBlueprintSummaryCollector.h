// Copyright OMUE. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"

/**
 * Minimal summary of a single UEdGraph — name and coarse kind only.
 * Does NOT contain nodes, pins, or links.
 */
struct FOmueGraphSummary
{
    FString Name;
    FString Kind; // "event", "function", "macro"
};

/**
 * Minimal summary of a single Blueprint variable — name and type category only.
 */
struct FOmueVariableSummary
{
    FString Name;
    FString Category;
};

/**
 * Minimal summary of a single Blueprint function — name only.
 */
struct FOmueFunctionSummary
{
    FString Name;
};

/**
 * Minimal summary of a single Blueprint macro — name only.
 */
struct FOmueMacroSummary
{
    FString Name;
};

/**
 * Top-level read-only summary of a single Blueprint asset.
 *
 * Contains metadata, graph/variable/function/macro name-level summaries.
 * Does NOT contain nodes, pins, links, node positions, GUIDs, or defaults.
 */
struct FOmueBlueprintSummary
{
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
    TArray<FOmueGraphSummary> Graphs;
    int32 VariableCount = 0;
    TArray<FOmueVariableSummary> Variables;
    int32 FunctionCount = 0;
    TArray<FOmueFunctionSummary> Functions;
    int32 MacroCount = 0;
    TArray<FOmueMacroSummary> Macros;
};

/**
 * Read-only collector for the currently selected Blueprint's top-level summary.
 *
 * K2a: Reads Content Browser selection, checks if it's a Blueprint, and
 * collects name/path/class/type/status plus graph/variable/function/macro
 * name-level summaries. No node-graph traversal. No asset modification.
 *
 * Pattern mirrors OmueAssetContextCollector:
 *   FContentBrowserModule::Get().GetSelectedAssets() → UBlueprint*.
 */
class OmueBlueprintSummaryCollector
{
public:
    OmueBlueprintSummaryCollector() = default;
    ~OmueBlueprintSummaryCollector() = default;

    // Non-copyable, non-movable.
    OmueBlueprintSummaryCollector(const OmueBlueprintSummaryCollector&) = delete;
    OmueBlueprintSummaryCollector& operator=(const OmueBlueprintSummaryCollector&) = delete;

    /**
     * Try to get a summary of the first selected Blueprint from Content Browser.
     *
     * @param OutSummary  Filled with Blueprint summary on success.
     * @return true if a Blueprint was selected and summary is valid.
     */
    bool TryGetBlueprintSummary(FOmueBlueprintSummary& OutSummary) const;
};
