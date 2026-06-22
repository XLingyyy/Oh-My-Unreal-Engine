// Copyright OMUE. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Misc/OutputDevice.h"

/**
 * One buffered log entry (internal representation, not serialised directly).
 */
struct FOmueLogEntry
{
    /** ISO 8601 timestamp captured at log time */
    FString Timestamp;

    /** Log category, e.g. "LogBlueprint", "LogTemp" */
    FString Category;

    /** UE ELogVerbosity as a lower-case string matching shared-protocol LogVerbosity */
    FString Verbosity;

    /** Log message body */
    FString Message;
};

/**
 * Thread-safe ring-buffer log collector.
 *
 * Registers as a UE FOutputDevice during Start() so that every
 * UE_LOG call after plugin startup is captured.  No disk files are
 * read.  No historical logs from before plugin startup are available.
 *
 * Capacity is fixed at construction; the oldest entries are silently
 * overwritten once the buffer is full.
 */
class OmueLogCollector
{
public:
    explicit OmueLogCollector(int32 InCapacity = 500);

    // Non-copyable, non-movable.
    OmueLogCollector(const OmueLogCollector&) = delete;
    OmueLogCollector& operator=(const OmueLogCollector&) = delete;

    ~OmueLogCollector();

    /** Start capturing logs. Must be called before GetRecentLogs(). */
    void Start();

    /** Stop capturing and unregister the output device. Safe to call repeatedly. */
    void Stop();

    /** Returns true if currently capturing. */
    bool IsRunning() const;

    /**
     * Return up to Count of the most recent log entries, ordered
     * oldest-to-newest.  Count is clamped to [1, Capacity].
     * Thread-safe.
     */
    void GetRecentLogs(int32 Count, TArray<FOmueLogEntry>& OutEntries) const;

private:
    /** Minimal FOutputDevice subclass that forwards to the collector. */
    class FOmueOutputDevice : public FOutputDevice
    {
    public:
        explicit FOmueOutputDevice(OmueLogCollector* InOwner);
        virtual void Serialize(const TCHAR* V, ELogVerbosity::Type Verbosity,
                               const FName& Category) override;

    private:
        OmueLogCollector* Owner;
    };

    /** Append a single entry (called from FOmueOutputDevice::Serialize). */
    void AppendEntry(const TCHAR* Message, ELogVerbosity::Type Verbosity,
                     const FName& Category);

    /** Map UE ELogVerbosity to shared-protocol LogVerbosity string. */
    static const TCHAR* VerbosityToString(ELogVerbosity::Type Verbosity);

    TArray<FOmueLogEntry> RingBuffer;
    int32 Capacity;
    int32 NextIndex = 0;   // where the next entry will be written
    int32 EntryCount = 0;  // total entries ever written (capped at Capacity)

    FOmueOutputDevice OutputDevice;

    mutable FCriticalSection Lock;

    bool bIsRunning = false;
};
