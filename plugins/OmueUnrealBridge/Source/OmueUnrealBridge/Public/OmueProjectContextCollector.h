// Copyright OMUE. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"

/**
 * Read-only collector for Unreal Engine project context.
 *
 * Phase A: basic read-only methods using stable UE APIs.
 * Phase C: added GetEditorStatus().
 *
 * No asset scanning. No Blueprint access. No modification.
 */
class OmueProjectContextCollector
{
public:
    OmueProjectContextCollector() = default;
    ~OmueProjectContextCollector() = default;

    // Non-copyable, non-movable.
    OmueProjectContextCollector(const OmueProjectContextCollector&) = delete;
    OmueProjectContextCollector& operator=(const OmueProjectContextCollector&) = delete;

    /**
     * Get the project name (.uproject filename without extension).
     * Uses FApp::GetProjectName().
     * Returns empty string if not running in an UE project context.
     */
    FString GetProjectName() const;

    /**
     * Get the project root directory absolute path.
     * Uses FPaths::ProjectDir().
     * Returns empty string if not running in an UE project context.
     */
    FString GetProjectPath() const;

    /**
     * Get the .uproject file absolute path.
     * Uses FPaths::GetProjectFilePath().
     * Returns empty string if not running in an UE project context.
     */
    FString GetUprojectFile() const;

    /**
     * Get the engine version string.
     * Uses FEngineVersion::Current().ToString().
     * Example return: "5.4.2-39008090+++UE5+Release-5.4"
     */
    FString GetEngineVersion() const;

    /**
     * Get the editor status string.
     *
     * Phase C conservative derivation:
     *   - GEditor == nullptr         → "loading"
     *   - GEditor->PlayWorld != nullptr → "playing"
     *   - otherwise                  → "idle"
     *
     * "simulating" and "compiling" detection would require deeper
     * Editor subsystem queries — deferred to a later phase.
     */
    FString GetEditorStatus() const;
};
