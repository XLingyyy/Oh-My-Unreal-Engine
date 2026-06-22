// Copyright OMUE. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"

/**
 * Minimal info for a single asset — returned by OmueAssetContextCollector.
 *
 * Fields match shared-protocol AssetContext where safe / feasible.
 * This is intentionally a plain struct (no UObject inheritance) so that
 * the collector stays lightweight and allocation-free.
 */
struct FOmueAssetInfo
{
    /** Display name (e.g. "MyBlueprint") */
    FString AssetName;

    /** Content Browser path (e.g. "/Game/Blueprints") */
    FString AssetPath;

    /** Asset class (e.g. "Blueprint", "StaticMesh") */
    FString AssetClass;

    /** Package path (e.g. "/Game/Blueprints/MyBlueprint") */
    FString PackagePath;

    /** true if the package is already loaded AND has unsaved changes */
    bool bIsDirty = false;

    /** Always true when returned — this collector only returns selected assets */
    bool bIsSelected = true;

    /**
     * true if the asset has a focused editor tab open.
     * Only detectable when the asset package is already in memory.
     * Unloaded assets are conservatively reported as false.
     */
    bool bIsOpenInEditor = false;
};

/**
 * Read-only collector for the currently selected Content Browser asset.
 *
 * Phase E: minimal single-asset selection via FContentBrowserModule.
 * No asset loading. No Blueprint access. No modification.
 * No AssetRegistry scanning. No iteration over all open asset editors.
 */
class OmueAssetContextCollector
{
public:
    OmueAssetContextCollector() = default;
    ~OmueAssetContextCollector() = default;

    // Non-copyable, non-movable.
    OmueAssetContextCollector(const OmueAssetContextCollector&) = delete;
    OmueAssetContextCollector& operator=(const OmueAssetContextCollector&) = delete;

    /**
     * Try to get the first selected asset from the Content Browser.
     *
     * @param OutInfo  Filled with asset details on success.
     * @return true if a selected asset was found and OutInfo is valid.
     */
    bool TryGetSelectedAsset(FOmueAssetInfo& OutInfo) const;
};
