// Copyright OMUE. All Rights Reserved.
//
// Phase G1 — OmueLogCollector implementation.
//
// Architecture:
//   A custom FOutputDevice is registered with GLog so every UE_LOG
//   call reaches OmueLogCollector::AppendEntry().  Entries are stored
//   in a fixed-capacity ring buffer protected by FCriticalSection.
//
//   No disk files are read.  No historical (pre-plugin-startup) logs
//   are available — this is a design choice for simplicity and safety.
//
// Thread safety:
//   UE_LOG can fire from any thread.  The ring buffer and all shared
//   state are guarded by Lock.  GetRecentLogs() takes a snapshot under
//   the lock and returns a copy, so callers never hold the raw buffer.
//
// Recursion guard:
//   OmueLogCollector itself uses UE_LOG for diagnostics.  To prevent
//   infinite recursion when Start() is active, AppendEntry() checks
//   whether the incoming category is LogOmueUnrealBridge and silently
//   drops it.  This means bridge-internal logs do not appear in
//   /logs/recent, but they still appear in the Editor Output Log
//   (GLog always has the default output device).

#include "OmueLogCollector.h"
#include "OmueUnrealBridgeModule.h"

#include "Misc/DateTime.h"

// ═══════════════════════════════════════════════════════════════
// Verbosity mapping → shared-protocol LogVerbosity
// ═══════════════════════════════════════════════════════════════

const TCHAR* OmueLogCollector::VerbosityToString(ELogVerbosity::Type Verbosity)
{
    switch (Verbosity)
    {
    case ELogVerbosity::Fatal:       return TEXT("fatal");
    case ELogVerbosity::Error:       return TEXT("error");
    case ELogVerbosity::Warning:     return TEXT("warning");
    case ELogVerbosity::Display:     return TEXT("display");
    case ELogVerbosity::Log:         return TEXT("log");
    case ELogVerbosity::Verbose:     return TEXT("verbose");
    case ELogVerbosity::VeryVerbose: return TEXT("very_verbose");
    default:                         return TEXT("log");
    }
}

// ═══════════════════════════════════════════════════════════════
// FOmueOutputDevice
// ═══════════════════════════════════════════════════════════════

OmueLogCollector::FOmueOutputDevice::FOmueOutputDevice(OmueLogCollector* InOwner)
    : Owner(InOwner)
{
}

void OmueLogCollector::FOmueOutputDevice::Serialize(
    const TCHAR* V,
    ELogVerbosity::Type Verbosity,
    const FName& Category)
{
    if (Owner)
    {
        Owner->AppendEntry(V, Verbosity, Category);
    }
}

// ═══════════════════════════════════════════════════════════════
// OmueLogCollector
// ═══════════════════════════════════════════════════════════════

OmueLogCollector::OmueLogCollector(int32 InCapacity)
    : Capacity(FMath::Clamp(InCapacity, 50, 2000))
    , OutputDevice(this)
{
    RingBuffer.SetNum(Capacity);
}

OmueLogCollector::~OmueLogCollector()
{
    Stop();
}

void OmueLogCollector::Start()
{
    if (bIsRunning)
    {
        return;
    }

    FScopeLock ScopeLock(&Lock);
    RingBuffer.SetNum(Capacity);
    NextIndex  = 0;
    EntryCount = 0;
    bIsRunning = true;

    GLog->AddOutputDevice(&OutputDevice);

    UE_LOG(LogOmueUnrealBridge, Log,
        TEXT("OmueLogCollector started (capacity %d)"), Capacity);
}

void OmueLogCollector::Stop()
{
    if (!bIsRunning)
    {
        return;
    }

    // Remove the device BEFORE clearing state to avoid a race where
    // a log fires between state-clear and device-removal.
    if (GLog)
    {
        GLog->RemoveOutputDevice(&OutputDevice);
    }

    {
        FScopeLock ScopeLock(&Lock);
        bIsRunning = false;
        RingBuffer.Empty();
        NextIndex  = 0;
        EntryCount = 0;
    }

    UE_LOG(LogOmueUnrealBridge, Log,
        TEXT("OmueLogCollector stopped"));
}

bool OmueLogCollector::IsRunning() const
{
    return bIsRunning;
}

void OmueLogCollector::GetRecentLogs(int32 Count, TArray<FOmueLogEntry>& OutEntries) const
{
    OutEntries.Reset();

    Count = FMath::Clamp(Count, 1, Capacity);

    FScopeLock ScopeLock(&Lock);

    if (EntryCount == 0)
    {
        return;
    }

    const int32 Available = FMath::Min(Count, EntryCount);
    OutEntries.Reserve(Available);

    // The ring buffer is logically ordered oldest→newest.
    // The first *valid* entry is at:
    //   StartIndex = (EntryCount >= Capacity)
    //              ? NextIndex                // buffer wrapped
    //              : 0                        // buffer not yet full
    // The entry just before NextIndex is the newest.
    int32 StartIndex;
    if (EntryCount >= Capacity)
    {
        StartIndex = NextIndex; // oldest is where next write will go
    }
    else
    {
        StartIndex = 0;
    }

    // Walk backwards from (NextIndex-1) to collect Count newest entries,
    // then reverse so the caller gets oldest→newest.
    TArray<FOmueLogEntry> Temp;
    Temp.Reserve(Available);

    for (int32 i = 0; i < Available; ++i)
    {
        int32 Idx = NextIndex - 1 - i;
        if (Idx < 0)
        {
            Idx += Capacity;
        }
        Temp.Add(RingBuffer[Idx]);
    }

    // Reverse to oldest→newest.
    for (int32 i = Temp.Num() - 1; i >= 0; --i)
    {
        OutEntries.Add(MoveTemp(Temp[i]));
    }
}

void OmueLogCollector::AppendEntry(
    const TCHAR* Message,
    ELogVerbosity::Type Verbosity,
    const FName& Category)
{
    // ── Recursion guard ───────────────────────────────────────
    // Drop logs originating from this plugin so that UE_LOG inside
    // OmueLogCollector / OmueHttpServer / OmueUnrealBridgeModule
    // does not cause infinite recursion.
    {
        const FName OurCategory(TEXT("LogOmueUnrealBridge"));
        if (Category == OurCategory)
        {
            return;
        }
    }

    FOmueLogEntry Entry;
    Entry.Timestamp = FDateTime::UtcNow().ToIso8601();
    Entry.Category  = Category.ToString();
    Entry.Verbosity = VerbosityToString(Verbosity);
    Entry.Message   = FString(Message);

    FScopeLock ScopeLock(&Lock);

    RingBuffer[NextIndex] = MoveTemp(Entry);
    NextIndex = (NextIndex + 1) % Capacity;
    EntryCount = FMath::Min(EntryCount + 1, Capacity);
}
