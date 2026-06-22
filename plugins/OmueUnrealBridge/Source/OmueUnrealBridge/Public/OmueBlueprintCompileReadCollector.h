// Copyright OMUE. All Rights Reserved.
//
// READ-ONLY COLLECTOR — KISMET ACCESS ALLOWED.
//
// This collector observes Blueprint compilation events for read-only
// compile status reporting.
//
//   Do NOT call FKismetEditorUtilities::CompileBlueprint().
//   Do NOT modify any Blueprint or asset.
//   Do NOT read UEdGraph or export Blueprint structure.
//
// K1 fix #4 (2026-06-04): per-Blueprint OnCompiled() as primary path.
//
// UE 5.7.4 has TWO compile-completion signals:
//   (A) GEditor->OnBlueprintCompiled() — no-arg global delegate
//   (B) UBlueprint::OnCompiled() — per-Blueprint event with UBlueprint*
//
// Previous K1 relied on (A) + TWeakObjectPtr stash, but user testing
// showed (A) does not reliably fire for manual Blueprint Editor
// compilations.  This fix switches to (B) as the primary completion
// signal:
//   - Start() enumerates loaded Blueprints via TObjectIterator and
//     binds each UBlueprint::OnCompiled().
//   - FCoreUObjectDelegates::OnAssetLoaded catches subsequently
//     loaded Blueprint assets.
//   - OnCompileCompleted() (global no-arg) is kept as diagnostic
//     fallback only — it logs but does NOT update state.
//   - GEditor->OnBlueprintPreCompile(UBlueprint*) is kept for the
//     isCompiling counter.
//   - FTSTicker deferred Status read is kept for safety (Status
//     may not be final when OnCompiled fires).
//
// K1 fix #5 (2026-06-04): deferred collector startup.
//
// When LoadingPhase is Default, StartupModule() runs before GEditor
// is initialized.  Previous Start() gave up permanently if GEditor
// was null.  Now Start() registers an FTSTicker retry tick when
// GEditor is not yet available; TryStartNow() does the real work
// once GEditor exists.
//
// K1 fix #6 (2026-06-04): robust isCompiling with per-Blueprint
// tracking + timeout safety net.
//
// The bare int32 InFlightCompileCount was vulnerable to imbalance
// when PIE/level-run triggers extra precompile/completion paths.
// Now each in-flight Blueprint is tracked individually in a
// TArray<TWeakObjectPtr<UBlueprint>>, with add-unique on precompile
// and removal on per-Blueprint compiled.  A periodic FTSTicker
// timeout checker (every 2s) detects stale entries that have had
// no activity for > 5s and force-clears them with a warning log.
// This only affects isCompiling — lastCompileResult/lastCompileTime
// are untouched.
//
// Per-Blueprint event signature (UE 5.7.4 Blueprint.h):
//   DECLARE_EVENT_OneParam(UBlueprint, FCompiledEvent, UBlueprint*)
//   FCompiledEvent& OnCompiled() { return CompiledEvent; }

#pragma once

#include "CoreMinimal.h"
#include "Containers/Ticker.h"
#include "Misc/DateTime.h"
#include "HAL/CriticalSection.h"

class UBlueprint;

/**
 * Read-only collector for Blueprint compile status.
 *
 * K1: Stateful collector driven by GEditor compile delegates.
 * Requires module lifecycle management (Start/Stop) — the owning
 * module calls Start() during StartupModule() and Stop() during
 * ShutdownModule().
 *
 * K1 fix (2026-06-04): OnCompileCompleted now schedules a
 * one-tick-deferred Status read via FTSTicker because
 * UBlueprint::Status may still be BS_Unknown when
 * GEditor->OnBlueprintCompiled() fires.  The deferred tick
 * callback reads Status on the game thread after the engine
 * has had a chance to finalize it.
 *
 * Thread safety: compile delegates may fire from worker threads.
 * All cached state is protected by FCriticalSection.
 *
 * K1 explicitly does NOT:
 *   - Read UEdGraph or export Blueprint structure (→ K2)
 *   - Trigger or call CompileBlueprint()
 *   - Write any asset or package
 */
class OmueBlueprintCompileReadCollector
{
public:
    OmueBlueprintCompileReadCollector();
    ~OmueBlueprintCompileReadCollector();

    // Non-copyable, non-movable.
    OmueBlueprintCompileReadCollector(const OmueBlueprintCompileReadCollector&) = delete;
    OmueBlueprintCompileReadCollector& operator=(const OmueBlueprintCompileReadCollector&) = delete;

    // ── Lifecycle ────────────────────────────────────────────────

    /** Request collector startup.  If GEditor is available, subscribes
     *  immediately.  If GEditor is null (e.g. module loaded before editor
     *  init), schedules an FTSTicker retry that calls TryStartNow() once
     *  GEditor exists.  Safe to call when already running or already
     *  waiting (no-op). */
    void Start();

    /** Unsubscribe delegates, cancel pending startup retry, and reset
     *  cached state.  Safe to call repeatedly. */
    void Stop();

    /** Returns true if currently subscribed to delegates. */
    bool IsRunning() const;

    // ── Compile status queries (thread-safe) ─────────────────────

    /** True while at least one Blueprint compilation is tracked in flight.
     *  Backed by per-Blueprint tracking array + timeout safety net. */
    bool IsCompiling() const;

    /** K1: derived from UBlueprint::Status of the last compiled BP.
     *  "unknown" if no BP has compiled since Start().  Uses a
     *  TWeakObjectPtr stashed in OnPreCompile, read in OnCompileCompleted. */
    FString GetLastCompileResult() const;

    /** Error count from last completed BP compilation.
     *  FML-2: reads cached count populated by ProbeMessageLog(). */
    int32 GetErrorCount() const;

    /** Warning count from last completed BP compilation (includes PerformanceWarning).
     *  FML-2: reads cached count populated by ProbeMessageLog(). */
    int32 GetWarningCount() const;

    /** FML-2: returns cached compile issues as JSON fragment strings.
     *  Each string is a CompileIssue-compatible JSON object.
     *  Max 20 entries, in order collected from MessageLog listing.
     *  Empty if no errors/warnings in the most recent compilation. */
    TArray<FString> GetLastErrors() const;

    /** ISO 8601 timestamp of the most recent BP compilation completion. Empty if none. */
    FString GetLastCompileTime() const;

private:
    // ── Delegate callbacks ───────────────────────────────────────

    /** Called when any Blueprint begins compiling.  Stashes the Blueprint
     *  pointer so OnCompileCompleted can read its Status. */
    void OnPreCompile(UBlueprint* Blueprint);

    /** Called when any Blueprint finishes compiling (UE 5.7.4: no-arg).
     *  Schedules a deferred Status read because Status may not be
     *  updated yet when this delegate fires. */
    /** DIAGNOSTIC ONLY — does NOT update cached state.
     *  The primary completion path is OnPerBlueprintCompiled(UBlueprint*). */
    void OnCompileCompleted();

    // ── Deferred status read ───────────────────────────────────

    /** Schedule a one-tick-deferred read of UBlueprint::Status via
     *  FTSTicker.  Called from OnPerBlueprintCompiled.  Safe to call
     *  when a deferred read is already pending (replaces it). */
    void ScheduleDeferredResultRead();

    /** FTSTicker callback: reads Status from the TWeakObjectPtr
     *  stashed by OnPerBlueprintCompiled / OnPreCompile and updates
     *  CachedLastCompileResult.
     *  Returns false (one-shot — do not re-tick). */
    bool OnDeferredTick(float DeltaTime);

    // ── Deferred startup (K1 fix #5) ──────────────────────────────

    /** FTSTicker callback for startup retry.  Tests GEditor, calls
     *  TryStartNow() when ready.  Returns false when GEditor is found
     *  or max retries exceeded (one-shot stop).  Returns true to
     *  keep retrying. */
    bool OnStartRetryTick(float DeltaTime);

    /** FTSTicker callback: checks for stale in-flight Blueprints.
     *  If InFlightBlueprints is non-empty and no compile activity for
     *  MaxInFlightStaleSeconds, logs a warning with the residual count
     *  and clears the array so isCompiling returns to false.
     *  Returns true to keep checking periodically. */
    bool OnInFlightTimeoutTick(float DeltaTime);

    /** The real startup logic: binds delegates, enumerates loaded
     *  Blueprints, subscribes to asset-loaded.  Only called when
     *  GEditor is confirmed available.  Sets bIsRunning on success.
     *  Cleans up PendingStartHandle and bStartRequested. */
    void TryStartNow();

    // ── State (protected by CacheLock) ───────────────────────────

    mutable FCriticalSection CacheLock;

    bool bIsRunning = false;

    /** True when Start() was called but GEditor is null.
     *  Prevents duplicate FTSTicker registration during the retry window. */
    bool bStartRequested = false;

    /** Number of startup retry attempts.  Reset on Stop() or on
     *  successful TryStartNow(). */
    int32 StartupRetryCount = 0;

    /** Maximum FTSTicker ticks to wait for GEditor before giving up.
     *  ~5 seconds at 60 fps editor tick rate. */
    static constexpr int32 MaxStartupRetries = 300;

    /** Tracked in-flight Blueprints (add-unique on precompile, remove on compiled).
     *  isCompiling ↔ this array is non-empty.  TWeakObjectPtr avoids keeping
     *  Blueprints alive.  Stale entries are cleaned by the timeout tick. */
    TArray<TWeakObjectPtr<UBlueprint>> InFlightBlueprints;

    /** Timestamp of last precompile or compiled event.  Used by the timeout
     *  tick to detect stale in-flight entries.  Initialized to MinValue so
     *  the timeout will NOT fire before the first compile event. */
    FDateTime LastCompileActivityTime;

    /** Handle for the periodic in-flight timeout checker.  Valid while running.
     *  Registered in TryStartNow(), cancelled in Stop(). */
    FTSTicker::FDelegateHandle InFlightTimeoutHandle;

    /** Maximum seconds without compile activity before stale in-flight
     *  entries are force-cleared.  5 seconds is well above the duration
     *  of any normal Blueprint compilation. */
    static constexpr double MaxInFlightStaleSeconds = 5.0;

    /** Interval for the timeout checker tick.  Checking every 2 seconds
     *  is frequent enough to catch stuck state quickly without meaningful
     *  overhead. */
    static constexpr double InFlightTimeoutCheckInterval = 2.0;

    /** Cached last compile result string. */
    FString CachedLastCompileResult;

    /** ISO 8601 timestamp of last compile completion. */
    FString CachedLastCompileTime;

    // ── FML-2: cached error/warning data from MessageLog probe ──

    /** Number of errors in the most recent BP compilation. */
    int32 CachedErrorCount = 0;

    /** Number of warnings (incl. PerformanceWarning) in the most recent BP compilation. */
    int32 CachedWarningCount = 0;

    /** Single cached compile issue from MessageLog. */
    struct FCachedIssue
    {
        FString Message;
        bool    bIsError;  // true=error, false=warning
    };

    /** Up to 20 most recent compile issues from the last BP compilation. */
    TArray<FCachedIssue> CachedLastIssues;

    /** Stashed from OnPerBlueprintCompiled(UBlueprint*) (primary) and
     *  OnPreCompile(UBlueprint*) (fallback).  Read in OnDeferredTick()
     *  to determine success/failed.  TWeakObjectPtr prevents a dangling
     *  reference if the Blueprint is garbage-collected between callbacks. */
    TWeakObjectPtr<UBlueprint> LastCompiledBlueprint;

    // ── Delegate handles ─────────────────────────────────────────

    FDelegateHandle PreCompileHandle;
    FDelegateHandle CompileCompletedHandle;

    bool bHasPreCompileDelegate = false;

    // ── Deferred tick handle (K1 fix) ──────────────────────────

    /** Handle for the FTSTicker startup retry.  Valid when Start()
     *  was called but GEditor is null.  Cleared in TryStartNow()
     *  and Stop(). */
    FTSTicker::FDelegateHandle PendingStartHandle;

    /** Handle for the FTSTicker deferred read.  Valid when a
     *  deferred Status check is pending.  Cleared in Stop(). */
    FTSTicker::FDelegateHandle PendingDeferredHandle;

    // ── Per-Blueprint compiled handler (K1 fix #4, primary path) ──

    /** Called when a specific UBlueprint finishes compiling.
     *  This is the PRIMARY compile-completion handler.
     *  UE 5.7.4: UBlueprint::OnCompiled() passes the UBlueprint*
     *  that was compiled.  Removes the Blueprint from
     *  InFlightBlueprints, updates LastCompiledBlueprint and
     *  CachedLastCompileTime, records LastCompileActivityTime,
     *  and schedules a deferred Status read via FTSTicker.
     *  Thread-safe: locks CacheLock. */
    void OnPerBlueprintCompiled(UBlueprint* Blueprint);

    // ── FML-1 probe ─────────────────────────────────────────────

    /** FML-2: reads MessageLog listing and writes results to cache.
     *  Uses FCompilerResultsLog::GetBlueprintMessageLog() +
     *  IMessageLogListing::GetFilteredMessages() to read current
     *  Blueprint compile diagnostics.  Outputs total/error/warning
     *  counts and up to 5 message texts via UE_LOG.  Also writes
     *  error/warning counts and up to 20 issue messages to
     *  CachedErrorCount / CachedWarningCount / CachedLastIssues
     *  under CacheLock.  Called from OnPerBlueprintCompiled
     *  after the K1 lock is released.
     *  Blueprint == nullptr → conservative warning, no crash. */
    void ProbeMessageLog(UBlueprint* Blueprint);

    /** Bind UBlueprint::OnCompiled() for one Blueprint.
     *  No-op if Blueprint is null or already bound.
     *  Must be called under CacheLock or from Start() (single-threaded). */
    void BindBlueprint(UBlueprint* Blueprint);

    /** FCoreUObjectDelegates::OnAssetLoaded callback.
     *  Filters for UBlueprint and binds its OnCompiled() event.
     *  Thread-safe: locks CacheLock. */
    void OnAssetLoaded(UObject* Object);

    // ── Per-Blueprint binding state ─────────────────────────────

    struct FPerBlueprintBinding
    {
        TWeakObjectPtr<UBlueprint> Blueprint;
        FDelegateHandle Handle;
    };

    /** All per-Blueprint OnCompiled() bindings.  Cleared in Stop(). */
    TArray<FPerBlueprintBinding> PerBlueprintBindings;

    /** Handle for FCoreUObjectDelegates::OnAssetLoaded. */
    FDelegateHandle AssetLoadedHandle;

    bool bHasAssetLoadedDelegate = false;
};
