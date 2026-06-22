// Copyright OMUE. All Rights Reserved.

#include "OmueCompileStatusCollector.h"

bool OmueCompileStatusCollector::IsCompiling() const
{
    // Phase H1: no safe Kismet-free API to detect live compilation.
    // Deferred to a future phase that can safely observe compile events.
    return false;
}

FString OmueCompileStatusCollector::GetLastCompileResult() const
{
    // Phase H1: last compile result is not observable without Kismet.
    // Returning "unknown" so that Desktop always shows the real state
    // rather than a fabricated value.
    return TEXT("unknown");
}

int32 OmueCompileStatusCollector::GetErrorCount() const
{
    return 0;
}

int32 OmueCompileStatusCollector::GetWarningCount() const
{
    return 0;
}
