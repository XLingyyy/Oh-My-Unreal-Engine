// Copyright OMUE. All Rights Reserved.
//
// Phase E — UE 5.7.4 API:
//   FContentBrowserModule::Get().GetSelectedAssets() → TArray<FAssetData>
//   FAssetData::AssetName / AssetClassPath / PackageName / PackagePath
//   FindPackage (safe — only finds already-loaded packages)
//   UAssetEditorSubsystem::FindEditorForAsset (only when asset is loaded)
//
// Explicitly NOT doing:
//   - FAssetData::GetAsset() — loads the asset, not safe
//   - AssetRegistry scan
//   - Blueprint node graph access
//   - Asset modification

#include "OmueAssetContextCollector.h"

#include "Editor.h"
#include "ContentBrowserModule.h"
#include "IContentBrowserSingleton.h"
#include "AssetRegistry/AssetData.h"
#include "UObject/Package.h"
#include "Subsystems/AssetEditorSubsystem.h"
#include "Misc/PackageName.h"

// ═══════════════════════════════════════════════════════════════
// Single public method
// ═══════════════════════════════════════════════════════════════

bool OmueAssetContextCollector::TryGetSelectedAsset(FOmueAssetInfo& OutInfo) const
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

    // Only report the first selected asset.
    // Full multi-selection support deferred to a later phase.
    const FAssetData& AssetData = SelectedAssets[0];

    // ── Basic asset identity (all from FAssetData, no loading) ──
    OutInfo.AssetName  = AssetData.AssetName.ToString();
    OutInfo.AssetClass = AssetData.AssetClassPath.GetAssetName().ToString();
    OutInfo.PackagePath = AssetData.PackageName.ToString();

    // AssetPath is the Content Browser path (directory, not package).
    // In UE5, FAssetData::PackagePath gives the folder path.
    OutInfo.AssetPath = AssetData.PackagePath.ToString();

    OutInfo.bIsSelected = true;

    // ── Dirty check (only for already‑loaded packages) ────────
    {
        FString PackageNameStr = AssetData.PackageName.ToString();
        UPackage* Pkg = FindPackage(nullptr, *PackageNameStr);
        // FindPackage only returns packages that are already in memory.
        // It does NOT load the package. Safe.
        if (Pkg != nullptr)
        {
            OutInfo.bIsDirty = Pkg->IsDirty();
        }
        else
        {
            OutInfo.bIsDirty = false;
        }
    }

    // ── Open‑in‑editor check ──────────────────────────────────
    {
        // FSoftObjectPath::ResolveObject finds the object if it is
        // already resident — it does NOT trigger loading. Safe.
        FSoftObjectPath SoftPath = AssetData.GetSoftObjectPath();
        UObject* ExistingObject = SoftPath.ResolveObject();

        if (ExistingObject != nullptr)
        {
            UAssetEditorSubsystem* EditorSubsystem =
                GEditor->GetEditorSubsystem<UAssetEditorSubsystem>();
            if (EditorSubsystem != nullptr
                && EditorSubsystem->FindEditorForAsset(ExistingObject, false) != nullptr)
            {
                OutInfo.bIsOpenInEditor = true;
            }
        }
        // If the object is not resident it cannot have an editor tab
        // open, so bIsOpenInEditor stays false — which is correct.
    }

    return true;
}
