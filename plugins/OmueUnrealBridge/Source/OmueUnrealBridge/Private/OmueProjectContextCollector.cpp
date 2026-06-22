// Copyright OMUE. All Rights Reserved.

#include "OmueProjectContextCollector.h"

#include "Misc/App.h"
#include "Misc/EngineVersion.h"
#include "Misc/Paths.h"
#include "Editor.h"

FString OmueProjectContextCollector::GetProjectName() const
{
    return FApp::GetProjectName();
}

FString OmueProjectContextCollector::GetProjectPath() const
{
    return FPaths::ProjectDir();
}

FString OmueProjectContextCollector::GetUprojectFile() const
{
    return FPaths::GetProjectFilePath();
}

FString OmueProjectContextCollector::GetEngineVersion() const
{
    return FEngineVersion::Current().ToString();
}

FString OmueProjectContextCollector::GetEditorStatus() const
{
    // Phase C: conservative 3-state check using only GEditor.
    // No complex subsystem queries. No timer/state-machine dependencies.

    if (GEditor == nullptr)
    {
        return TEXT("loading");
    }

    // UEditorEngine::PlayWorld is non-null when PIE is running.
    // This covers both "in editor" and "in window" play modes.
    if (GEditor->PlayWorld != nullptr)
    {
        return TEXT("playing");
    }

    // Default: Editor is idle.
    // "simulating" and "compiling" would require additional queries
    // (e.g. FEditorDelegates or subsystem state) — deferred.
    return TEXT("idle");
}
