// Copyright OMUE. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"

/**
 * Read-only collector for Unreal Engine compile status.
 *
 * Phase H1: conservative implementation — all methods return safe defaults
 * because UE 5.7.4 has no safe Kismet-free API to query live compile state.
 *
 * This class intentionally reports "unknown" rather than guessing, so that
 * Desktop consumers never see a fabricated "success" or "failed" result.
 *
 * No asset modification. No compilation triggered. No disk log parsing.
 * No Blueprint access. No AssetRegistry scan.
 */
class OmueCompileStatusCollector
{
public:
    OmueCompileStatusCollector() = default;
    ~OmueCompileStatusCollector() = default;

    // Non-copyable, non-movable.
    OmueCompileStatusCollector(const OmueCompileStatusCollector&) = delete;
    OmueCompileStatusCollector& operator=(const OmueCompileStatusCollector&) = delete;

    /**
     * Returns true if the editor is currently compiling.
     * Phase H1: always false — no safe way to detect without Kismet.
     */
    bool IsCompiling() const;

    /**
     * Returns the last compile result as a string matching
     * shared-protocol CompileResult: "unknown" | "success" | "failed" | "canceled".
     * Phase H1: always "unknown".
     */
    FString GetLastCompileResult() const;

    /**
     * Returns the error count from the last compilation.
     * Phase H1: always 0.
     */
    int32 GetErrorCount() const;

    /**
     * Returns the warning count from the last compilation.
     * Phase H1: always 0.
     */
    int32 GetWarningCount() const;
};
