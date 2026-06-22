// Copyright OMUE. All Rights Reserved.
//
// READ-ONLY COLLECTOR — KISMET ACCESS ALLOWED.
//
// K1 fix #4 (2026-06-04): per-Blueprint OnCompiled() as primary path.
//
// Previous K1 relied on GEditor->OnBlueprintCompiled() (no-arg global
// delegate) + TWeakObjectPtr stash from OnPreCompile.  User testing
// showed the global no-arg delegate does NOT reliably fire for manual
// Blueprint Editor compilations in UE 5.7.4.
//
// This fix switches to UBlueprint::OnCompiled() (per-Blueprint event
// with UBlueprint* parameter) as the primary compile-completion signal.
// Loaded Blueprints are enumerated via TObjectIterator<UBlueprint> at
// Start(); subsequently loaded Blueprints are caught via
// FCoreUObjectDelegates::OnAssetLoaded.
//
// GEditor->OnBlueprintCompiled() (global no-arg) is kept as diagnostic
// fallback only — it logs but does NOT update cached state.
//
// FTSTicker deferred Status read is retained because UBlueprint::Status
// may not be final when OnCompiled fires.
//
// K1 fix #6 (2026-06-04): robust isCompiling with per-Blueprint tracking
// + timeout safety net.
//
// The bare int32 InFlightCompileCount was replaced with per-Blueprint
// tracking (TArray<TWeakObjectPtr<UBlueprint>> InFlightBlueprints).
// OnPreCompile adds (add-unique), OnPerBlueprintCompiled removes by
// matching pointer.  A periodic FTSTicker (every 2s) detects entries
// that have been stale for > 5s and force-clears them — this handles
// PIE/level-run paths that fire extra precompile events without
// matching completions.  The timeout only affects isCompiling;
// lastCompileResult and lastCompileTime are untouched.
//
// Diagnostic UE_LOG calls are placed at each callback so the user can
// verify delegate firing, Status values, and timing in the UE Output Log.

#include "OmueBlueprintCompileReadCollector.h"
#include "OmueUnrealBridgeModule.h"

#include "Editor.h"                  // GEditor
#include "Engine/Blueprint.h"        // UBlueprint, EBlueprintStatus, OnCompiled()
#include "Misc/DateTime.h"
#include "Containers/Ticker.h"       // FTSTicker — deferred Status read
#include "UObject/UObjectGlobals.h"  // FCoreUObjectDelegates::OnAssetLoaded
#include "UObject/UObjectIterator.h" // TObjectIterator<UBlueprint>

// ── FML-1 probe: MessageLog read-only diagnostic inspection ──
#include "Logging/TokenizedMessage.h"       // FTokenizedMessage, EMessageSeverity
#include "MessageLogModule.h"              // FMessageLogModule (listing access)
#include "IMessageLogListing.h"             // IMessageLogListing::GetFilteredMessages()
#include "Kismet2/CompilerResultsLog.h"     // FCompilerResultsLog::GetBlueprintMessageLog()

// ═══════════════════════════════════════════════════════════════
// Construction / Destruction
// ═══════════════════════════════════════════════════════════════

OmueBlueprintCompileReadCollector::OmueBlueprintCompileReadCollector()
{
    CachedLastCompileResult = TEXT("unknown");
    LastCompileActivityTime = FDateTime::MinValue();
}

OmueBlueprintCompileReadCollector::~OmueBlueprintCompileReadCollector()
{
    Stop();
}

// ═══════════════════════════════════════════════════════════════
// Lifecycle
// ═══════════════════════════════════════════════════════════════

void OmueBlueprintCompileReadCollector::Start()
{
    if (bIsRunning)
    {
        return;
    }

    if (bStartRequested)
    {
        // Already waiting for GEditor via FTSTicker retry.
        return;
    }

    if (GEditor)
    {
        TryStartNow();
        return;
    }

    // GEditor is not available yet — schedule a retry via FTSTicker.
    bStartRequested = true;
    StartupRetryCount = 0;

    UE_LOG(LogOmueUnrealBridge, Log,
        TEXT("OmueBlueprintCompileReadCollector: start deferred because "
             "GEditor is null. Will retry on game-thread ticks (max %d retries)."),
        MaxStartupRetries);

    PendingStartHandle = FTSTicker::GetCoreTicker().AddTicker(
        FTickerDelegate::CreateRaw(
            this, &OmueBlueprintCompileReadCollector::OnStartRetryTick),
        0.0f);  // check on the next game-thread tick

    if (!PendingStartHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("OmueBlueprintCompileReadCollector: failed to register "
                 "startup retry ticker. Compile status will remain unavailable."));
        bStartRequested = false;
    }
}

void OmueBlueprintCompileReadCollector::TryStartNow()
{
    // Clean up the pending start ticker now that we're actually starting.
    if (PendingStartHandle.IsValid())
    {
        FTSTicker::GetCoreTicker().RemoveTicker(PendingStartHandle);
        PendingStartHandle.Reset();
    }
    bStartRequested = false;
    StartupRetryCount = 0;

    // ── Safety: double-check GEditor is still available ─────────
    //
    // TryStartNow() is called from OnStartRetryTick() which already
    // tested GEditor, but belts and suspenders.
    if (!GEditor)
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("OmueBlueprintCompileReadCollector::TryStartNow: GEditor "
                 "unexpectedly null. Startup aborted."));
        return;
    }

    // ── Subscribe to Blueprint pre-compile delegate ────────────
    //
    // GEditor->OnBlueprintPreCompile fires when any Blueprint
    // begins compiling.  Used for the isCompiling counter.
    //
    // UE 5.7.4: DECLARE_TS_MULTICAST_DELEGATE_OneParam(..., UBlueprint*)
    PreCompileHandle =
        GEditor->OnBlueprintPreCompile().AddRaw(
            this, &OmueBlueprintCompileReadCollector::OnPreCompile);
    bHasPreCompileDelegate = PreCompileHandle.IsValid();

    // ── Enumerate loaded Blueprints; bind per-BP OnCompiled() ──
    //
    // TObjectIterator<UBlueprint> finds all UBlueprint objects
    // currently in memory.  This is NOT an AssetRegistry scan —
    // it only touches objects already loaded by the editor.
    int32 BoundCount = 0;
    for (TObjectIterator<UBlueprint> It; It; ++It)
    {
        UBlueprint* BP = *It;
        if (BP)
        {
            BindBlueprint(BP);
            ++BoundCount;
        }
    }

    // ── Subscribe to asset-loaded for future Blueprints ────────
    //
    // FCoreUObjectDelegates::OnAssetLoaded fires when any UObject
    // asset finishes loading.  We filter for UBlueprint and bind
    // OnCompiled() for each newly loaded Blueprint.
    AssetLoadedHandle =
        FCoreUObjectDelegates::OnAssetLoaded.AddRaw(
            this, &OmueBlueprintCompileReadCollector::OnAssetLoaded);
    bHasAssetLoadedDelegate = AssetLoadedHandle.IsValid();

    // ── Keep global no-arg delegate as diagnostic fallback ─────
    //
    // GEditor->OnBlueprintCompiled() is the global no-arg delegate.
    // It does NOT reliably fire for manual Blueprint Editor
    // compilations in UE 5.7.4.  Kept only for diagnostic logging.
    // The primary completion path is OnPerBlueprintCompiled(UBlueprint*).
    CompileCompletedHandle =
        GEditor->OnBlueprintCompiled().AddRaw(
            this, &OmueBlueprintCompileReadCollector::OnCompileCompleted);

    bIsRunning = true;

    // ── Start periodic in-flight timeout checker ─────────────────
    //
    // Runs every InFlightTimeoutCheckInterval seconds to detect
    // stale in-flight entries (e.g. from PIE-triggered precompile
    // events without matching completion).  Force-clears stuck
    // entries so isCompiling doesn't stay true permanently.
    InFlightTimeoutHandle =
        FTSTicker::GetCoreTicker().AddTicker(
            FTickerDelegate::CreateRaw(
                this, &OmueBlueprintCompileReadCollector::OnInFlightTimeoutTick),
            static_cast<float>(InFlightTimeoutCheckInterval));

    UE_LOG(LogOmueUnrealBridge, Log,
        TEXT("OmueBlueprintCompileReadCollector started: "
             "bound %d loaded Blueprints, assetLoadedDelegate: %s, "
             "preCompileDelegate: %s, globalCompiledDelegate (diag): %s"),
        BoundCount,
        bHasAssetLoadedDelegate ? TEXT("yes") : TEXT("no"),
        bHasPreCompileDelegate ? TEXT("yes") : TEXT("no"),
        CompileCompletedHandle.IsValid() ? TEXT("yes") : TEXT("no"));
}

bool OmueBlueprintCompileReadCollector::OnStartRetryTick(float DeltaTime)
{
    ++StartupRetryCount;

    if (GEditor)
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("OmueBlueprintCompileReadCollector: GEditor available "
                 "(retry %d), starting now..."),
            StartupRetryCount);
        TryStartNow();
        return false;  // one-shot — startup complete (or failed)
    }

    if (StartupRetryCount >= MaxStartupRetries)
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("OmueBlueprintCompileReadCollector: GEditor still null "
                 "after %d retries (max %d). Compile status will remain "
                 "unavailable. Check plugin loading configuration or "
                 "restart the editor."),
            StartupRetryCount, MaxStartupRetries);
        PendingStartHandle.Reset();
        bStartRequested = false;
        return false;  // one-shot — stop retrying
    }

    return true;  // keep retrying on next tick
}

bool OmueBlueprintCompileReadCollector::OnInFlightTimeoutTick(float DeltaTime)
{
    FScopeLock Lock(&CacheLock);

    if (InFlightBlueprints.Num() == 0)
    {
        // Nothing in flight — nothing to time out.
        return true;  // keep checking periodically
    }

    const double SecondsSinceLastActivity =
        (FDateTime::UtcNow() - LastCompileActivityTime).GetTotalSeconds();

    if (SecondsSinceLastActivity > MaxInFlightStaleSeconds)
    {
        const int32 StaleCount = InFlightBlueprints.Num();
        UE_LOG(LogOmueUnrealBridge, Warning,
            TEXT("[BP Compile] InFlightTimeout: %d tracked in-flight Blueprint(s) "
                 "have been stale for %.1f seconds (>%.0f s max). "
                 "Force-clearing in-flight state so isCompiling returns to false. "
                 "This may indicate unmatched precompile events (e.g. from PIE/level-run paths)."),
            StaleCount, SecondsSinceLastActivity, MaxInFlightStaleSeconds);

        InFlightBlueprints.Empty();
        // NOTE: We do NOT touch CachedLastCompileResult,
        // CachedLastCompileTime, or LastCompiledBlueprint.
        // This timeout only affects isCompiling.
    }

    return true;  // keep checking periodically
}

void OmueBlueprintCompileReadCollector::Stop()
{
    // ── Cancel pending startup retry ticker ────────────────────
    if (PendingStartHandle.IsValid())
    {
        FTSTicker::GetCoreTicker().RemoveTicker(PendingStartHandle);
        PendingStartHandle.Reset();
    }
    bStartRequested = false;
    StartupRetryCount = 0;

    if (!bIsRunning)
    {
        return;
    }

    // ── Unsubscribe GEditor delegates ──────────────────────────

    if (bHasPreCompileDelegate && PreCompileHandle.IsValid() && GEditor)
    {
        GEditor->OnBlueprintPreCompile().Remove(PreCompileHandle);
        PreCompileHandle.Reset();
        bHasPreCompileDelegate = false;
    }

    if (CompileCompletedHandle.IsValid() && GEditor)
    {
        GEditor->OnBlueprintCompiled().Remove(CompileCompletedHandle);
        CompileCompletedHandle.Reset();
    }

    // ── Cancel pending deferred Status read ────────────────
    if (PendingDeferredHandle.IsValid())
    {
        FTSTicker::GetCoreTicker().RemoveTicker(PendingDeferredHandle);
        PendingDeferredHandle.Reset();
    }

    // ── Cancel in-flight timeout checker ────────────────────
    if (InFlightTimeoutHandle.IsValid())
    {
        FTSTicker::GetCoreTicker().RemoveTicker(InFlightTimeoutHandle);
        InFlightTimeoutHandle.Reset();
    }

    // ── Unbind all per-Blueprint OnCompiled() handles ──────────
    //
    // TWeakObjectPtr::IsValid() guards against Blueprints that
    // were garbage-collected between bind and unbind.
    for (auto& Binding : PerBlueprintBindings)
    {
        if (Binding.Blueprint.IsValid() && Binding.Handle.IsValid())
        {
            Binding.Blueprint->OnCompiled().Remove(Binding.Handle);
        }
    }
    PerBlueprintBindings.Empty();

    // ── Unbind asset-loaded delegate ───────────────────────────
    if (bHasAssetLoadedDelegate && AssetLoadedHandle.IsValid())
    {
        FCoreUObjectDelegates::OnAssetLoaded.Remove(AssetLoadedHandle);
        AssetLoadedHandle.Reset();
        bHasAssetLoadedDelegate = false;
    }

    {
        FScopeLock Lock(&CacheLock);
        bIsRunning = false;
        InFlightBlueprints.Empty();
        LastCompileActivityTime = FDateTime::MinValue();
        // FML-2: clear cached compile error/warning data
        CachedErrorCount   = 0;
        CachedWarningCount = 0;
        CachedLastIssues.Empty();
    }

    UE_LOG(LogOmueUnrealBridge, Log,
        TEXT("OmueBlueprintCompileReadCollector stopped"));
}

bool OmueBlueprintCompileReadCollector::IsRunning() const
{
    return bIsRunning;
}

// ═══════════════════════════════════════════════════════════════
// Delegate callbacks
// ═══════════════════════════════════════════════════════════════

void OmueBlueprintCompileReadCollector::OnPreCompile(UBlueprint* Blueprint)
{
    FScopeLock Lock(&CacheLock);

    // ── Track this Blueprint as in-flight ───────────────────────
    //
    // Use add-unique to avoid double-counting if UE fires
    // precompile twice for the same BP without an intervening
    // completion.  Null Blueprints are NOT tracked (there is no
    // object to key on), but a warning is logged — the timeout
    // safety net will clear any resulting imbalance.
    if (Blueprint)
    {
        bool bAlreadyInFlight = InFlightBlueprints.ContainsByPredicate(
            [Blueprint](const TWeakObjectPtr<UBlueprint>& Entry) {
                return Entry.Get() == Blueprint;
            });

        if (!bAlreadyInFlight)
        {
            InFlightBlueprints.Add(TWeakObjectPtr<UBlueprint>(Blueprint));
        }

        // Stash the Blueprint pointer as a fallback reference.
        // The primary completion path (OnPerBlueprintCompiled) also
        // updates this, but stashing here ensures we have something
        // even if the per-BP callback is somehow missed.
        LastCompiledBlueprint = Blueprint;

        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("[BP Compile] OnPreCompile: %s (%s) — Status=%d, trackedInFlight=%d"),
            *Blueprint->GetName(),
            *Blueprint->GetPathName(),
            static_cast<int32>(Blueprint->Status),
            InFlightBlueprints.Num());
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Warning,
            TEXT("[BP Compile] OnPreCompile: Blueprint is null! "
                 "Not tracked. trackedInFlight=%d"),
            InFlightBlueprints.Num());
    }

    // ── Record activity time for timeout detection ──────────────
    LastCompileActivityTime = FDateTime::UtcNow();
}

void OmueBlueprintCompileReadCollector::OnCompileCompleted()
{
    // ── DIAGNOSTIC ONLY — NOT the primary completion path ──────
    //
    // GEditor->OnBlueprintCompiled() is the global no-arg delegate.
    // In UE 5.7.4 it does NOT reliably fire for manual Blueprint
    // Editor compilations.  The primary completion path is
    // OnPerBlueprintCompiled(UBlueprint*), bound per-Blueprint via
    // UBlueprint::OnCompiled().
    //
    // This handler ONLY logs that the global delegate fired.
    // It does NOT update InFlightCompileCount, CachedLastCompileTime,
    // CachedLastCompileResult, or schedule a deferred read.

    UE_LOG(LogOmueUnrealBridge, Log,
        TEXT("[BP Compile] OnCompileCompleted (global no-arg, DIAGNOSTIC): "
             "fired — primary path is per-Blueprint OnCompiled(UBlueprint*)"));
}

// ═══════════════════════════════════════════════════════════════
// Per-Blueprint compiled handler (K1 fix #4, primary path)
// ═══════════════════════════════════════════════════════════════

void OmueBlueprintCompileReadCollector::OnPerBlueprintCompiled(UBlueprint* Blueprint)
{
    {
        FScopeLock Lock(&CacheLock);

        // ── Remove this Blueprint from in-flight tracking ──────────
        //
        // RemoveAll removes every matching entry (normally one).
        // This handles edge cases where the same BP may have been
        // added more than once (e.g. through both OnPreCompile and
        // a PIE-triggered path).
        if (Blueprint)
        {
            const int32 BeforeCount = InFlightBlueprints.Num();
            InFlightBlueprints.RemoveAll(
                [Blueprint](const TWeakObjectPtr<UBlueprint>& Entry) {
                    return Entry.Get() == Blueprint;
                });
            const int32 RemovedCount = BeforeCount - InFlightBlueprints.Num();

            UE_LOG(LogOmueUnrealBridge, Log,
                TEXT("[BP Compile] OnPerBlueprintCompiled (PRIMARY): %s (%s) "
                     "— immediate Status=%d, removedFromInFlight=%d, trackedInFlight=%d "
                     "→ scheduling deferred read"),
                *Blueprint->GetName(),
                *Blueprint->GetPathName(),
                static_cast<int32>(Blueprint->Status),
                RemovedCount,
                InFlightBlueprints.Num());
        }
        else
        {
            UE_LOG(LogOmueUnrealBridge, Warning,
                TEXT("[BP Compile] OnPerBlueprintCompiled: Blueprint is null! trackedInFlight=%d"),
                InFlightBlueprints.Num());
        }

        // ── Stash Blueprint and record completion time ─────────────
        //
        // Use the Blueprint* passed by the event (not the one stashed
        // in OnPreCompile) — this is the actual compiled object.
        LastCompiledBlueprint = Blueprint;
        CachedLastCompileTime = FDateTime::UtcNow().ToIso8601();

        // ── Record activity time for timeout detection ──────────────
        LastCompileActivityTime = FDateTime::UtcNow();

        // ── Schedule deferred Status read ──────────────────────────
        //
        // UBlueprint::Status may still be BS_Unknown when OnCompiled
        // fires.  The FTSTicker deferred read gives the engine one
        // game-thread tick to finalize the compile result.
        ScheduleDeferredResultRead();
    }

    // ── FML-1 probe: verify MessageLog listing readability ─────
    //
    // The probe reads external MessageLog state, writes UE_LOG diagnostics,
    // and updates CachedErrorCount / CachedWarningCount / CachedLastIssues under CacheLock.
    ProbeMessageLog(Blueprint);
}

// ═══════════════════════════════════════════════════════════════
// FML-1 probe: MessageLog listing readability verification
// ═══════════════════════════════════════════════════════════════

void OmueBlueprintCompileReadCollector::ProbeMessageLog(UBlueprint* Blueprint)
{
    if (!Blueprint)
    {
        UE_LOG(LogOmueUnrealBridge, Warning,
            TEXT("FML-2 probe: Blueprint is null, cannot probe MessageLog"));
        return;
    }

    UE_LOG(LogOmueUnrealBridge, Log,
        TEXT("FML-2 probe start: %s"), *Blueprint->GetPathName());

    // Step 1: Get the MessageLog listing for this Blueprint.
    TSharedRef<IMessageLogListing> Listing =
        FCompilerResultsLog::GetBlueprintMessageLog(Blueprint);

    // Step 2: Get filtered messages (read-only, no side effects).
    const TArray<TSharedRef<FTokenizedMessage>>& Messages =
        Listing->GetFilteredMessages();

    // Step 3: Count errors/warnings, log up to 5, collect up to 20 for cache.
    int32 ErrorCount = 0;
    int32 WarningCount = 0;
    int32 LoggedCount = 0;
    static constexpr int32 MaxLogMessages = 5;
    static constexpr int32 MaxCacheIssues = 20;
    TArray<FCachedIssue> Issues;

    int32 E5aProbeCount = 0;
    static constexpr int32 MaxE5aProbeMessages = 5;

    for (const TSharedRef<FTokenizedMessage>& Msg : Messages)
    {
        const EMessageSeverity::Type Severity = Msg->GetSeverity();

        if (Severity == EMessageSeverity::Error)
        {
            ++ErrorCount;
            if (LoggedCount < MaxLogMessages)
            {
                UE_LOG(LogOmueUnrealBridge, Log,
                    TEXT("FML-2 probe [ERROR]: %s"),
                    *Msg->ToText().ToString());
                ++LoggedCount;
            }
            if (Issues.Num() < MaxCacheIssues)
            {
                FCachedIssue Issue;
                Issue.Message  = Msg->ToText().ToString();
                Issue.bIsError = true;
                Issues.Add(Issue);
            }
        }
        else if (Severity == EMessageSeverity::Warning ||
                 Severity == EMessageSeverity::PerformanceWarning)
        {
            ++WarningCount;
            if (LoggedCount < MaxLogMessages)
            {
                UE_LOG(LogOmueUnrealBridge, Log,
                    TEXT("FML-2 probe [WARNING]: %s"),
                    *Msg->ToText().ToString());
                ++LoggedCount;
            }
            if (Issues.Num() < MaxCacheIssues)
            {
                FCachedIssue Issue;
                Issue.Message  = Msg->ToText().ToString();
                Issue.bIsError = false;
                Issues.Add(Issue);
            }
        }

        // ── E5a probe: diagnostic token inspection ──
        if (E5aProbeCount < MaxE5aProbeMessages)
        {
            const int32 MsgIndex = E5aProbeCount;
            const int32 SeverityInt = static_cast<int32>(Severity);

            // --- Message link token ---
            TSharedPtr<IMessageToken> LinkToken = Msg->GetMessageLink();
            if (LinkToken.IsValid())
            {
                UE_LOG(LogOmueUnrealBridge, Log,
                    TEXT("E5a probe: msg[%d] severity=%d | link=non-null | linkText=\"%s\" | linkType=%d"),
                    MsgIndex, SeverityInt,
                    *LinkToken->ToText().ToString(),
                    static_cast<int32>(LinkToken->GetType()));
            }
            else
            {
                UE_LOG(LogOmueUnrealBridge, Log,
                    TEXT("E5a probe: msg[%d] severity=%d | link=null"),
                    MsgIndex, SeverityInt);
            }

            // --- Message tokens ---
            const TArray<TSharedRef<IMessageToken>>& Tokens = Msg->GetMessageTokens();
            UE_LOG(LogOmueUnrealBridge, Log,
                TEXT("E5a probe: msg[%d] tokenCount=%d"),
                MsgIndex, Tokens.Num());

            int32 TokenLogCount = 0;
            static constexpr int32 MaxTokenLogPerMsg = 5;
            for (const TSharedRef<IMessageToken>& Token : Tokens)
            {
                if (TokenLogCount >= MaxTokenLogPerMsg)
                {
                    break;
                }

                const EMessageToken::Type TokenType = Token->GetType();
                FString DiagExtra;

                switch (TokenType)
                {
                case EMessageToken::URL:
                    DiagExtra = FString::Printf(TEXT(" | url=\"%s\""),
                        *StaticCastSharedRef<FURLToken>(Token)->GetURL());
                    break;
                case EMessageToken::AssetName:
                    DiagExtra = FString::Printf(TEXT(" | assetName=\"%s\""),
                        *StaticCastSharedRef<FAssetNameToken>(Token)->GetAssetName());
                    break;
                case EMessageToken::Actor:
                    {
                        TSharedRef<FActorToken> ActorToken = StaticCastSharedRef<FActorToken>(Token);
                        DiagExtra = FString::Printf(TEXT(" | actorPath=\"%s\" | actorGuid=%s"),
                            *ActorToken->GetActorPath(),
                            *ActorToken->GetActorGuid().ToString());
                    }
                    break;
                default:
                    // Object, AssetData, EdGraph, etc. — generic text/type only
                    break;
                }

                UE_LOG(LogOmueUnrealBridge, Log,
                    TEXT("E5a probe: msg[%d] token[%d] type=%d text=\"%s\"%s"),
                    MsgIndex, TokenLogCount, static_cast<int32>(TokenType),
                    *Token->ToText().ToString(),
                    *DiagExtra);

                ++TokenLogCount;
            }

            // --- Link token subclass detail ---
            if (LinkToken.IsValid())
            {
                const EMessageToken::Type LinkType = LinkToken->GetType();
                FString LinkExtra;

                switch (LinkType)
                {
                case EMessageToken::URL:
                    LinkExtra = FString::Printf(TEXT(" | linkURL=\"%s\""),
                        *StaticCastSharedPtr<FURLToken>(LinkToken)->GetURL());
                    break;
                case EMessageToken::AssetName:
                    LinkExtra = FString::Printf(TEXT(" | linkAssetName=\"%s\""),
                        *StaticCastSharedPtr<FAssetNameToken>(LinkToken)->GetAssetName());
                    break;
                case EMessageToken::Actor:
                    {
                        TSharedPtr<FActorToken> ActorToken = StaticCastSharedPtr<FActorToken>(LinkToken);
                        LinkExtra = FString::Printf(TEXT(" | linkActorPath=\"%s\" | linkActorGuid=%s"),
                            *ActorToken->GetActorPath(),
                            *ActorToken->GetActorGuid().ToString());
                    }
                    break;
                default:
                    break;
                }

                if (!LinkExtra.IsEmpty())
                {
                    UE_LOG(LogOmueUnrealBridge, Log,
                        TEXT("E5a probe: msg[%d] link detail: type=%d%s"),
                        MsgIndex, static_cast<int32>(LinkType), *LinkExtra);
                }
            }

            ++E5aProbeCount;
        }
    }

    UE_LOG(LogOmueUnrealBridge, Log,
        TEXT("FML-2 probe complete: total=%d, errors=%d, warnings=%d, cached=%d"),
        Messages.Num(), ErrorCount, WarningCount, Issues.Num());

    // Step 4: Write results to cache under lock.
    {
        FScopeLock Lock(&CacheLock);
        CachedErrorCount   = ErrorCount;
        CachedWarningCount = WarningCount;
        CachedLastIssues   = MoveTemp(Issues);
    }
}

// ═══════════════════════════════════════════════════════════════
// Blueprint binding helpers
// ═══════════════════════════════════════════════════════════════

void OmueBlueprintCompileReadCollector::BindBlueprint(UBlueprint* Blueprint)
{
    if (!Blueprint)
    {
        return;
    }

    // ── Check for duplicate binding ────────────────────────────
    for (const auto& Binding : PerBlueprintBindings)
    {
        if (Binding.Blueprint.Get() == Blueprint)
        {
            return;  // Already bound
        }
    }

    // ── Bind UBlueprint::OnCompiled() ──────────────────────────
    //
    // UE 5.7.4: UBlueprint::OnCompiled() is declared as
    //   DECLARE_EVENT_OneParam(UBlueprint, FCompiledEvent, UBlueprint*)
    // It passes the compiled UBlueprint* to the handler.
    FDelegateHandle Handle =
        Blueprint->OnCompiled().AddRaw(
            this, &OmueBlueprintCompileReadCollector::OnPerBlueprintCompiled);

    if (Handle.IsValid())
    {
        PerBlueprintBindings.Add({Blueprint, Handle});
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("[BP Compile] Bound OnCompiled() for %s (%s)"),
            *Blueprint->GetName(), *Blueprint->GetPathName());
    }
}

void OmueBlueprintCompileReadCollector::OnAssetLoaded(UObject* Object)
{
    UBlueprint* BP = Cast<UBlueprint>(Object);
    if (BP)
    {
        FScopeLock Lock(&CacheLock);
        BindBlueprint(BP);
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("[BP Compile] Asset-loaded Blueprint bound: %s (%s)"),
            *BP->GetName(), *BP->GetPathName());
    }
}

// ═══════════════════════════════════════════════════════════════
// Deferred status read
// ═══════════════════════════════════════════════════════════════

void OmueBlueprintCompileReadCollector::ScheduleDeferredResultRead()
{
    // Cancel any pending deferred read — we only need the latest.
    if (PendingDeferredHandle.IsValid())
    {
        FTSTicker::GetCoreTicker().RemoveTicker(PendingDeferredHandle);
        PendingDeferredHandle.Reset();
    }

    PendingDeferredHandle =
        FTSTicker::GetCoreTicker().AddTicker(
            FTickerDelegate::CreateRaw(
                this, &OmueBlueprintCompileReadCollector::OnDeferredTick),
            0.0f);  // fire on the next game-thread tick

    if (!PendingDeferredHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Warning,
            TEXT("[BP Compile] Failed to schedule deferred Status read via FTSTicker"));
    }
}

bool OmueBlueprintCompileReadCollector::OnDeferredTick(float DeltaTime)
{
    FScopeLock Lock(&CacheLock);

    // ── Read Status from the stashed BP pointer ─────────────────
    //
    // By now (one game-thread tick after OnPerBlueprintCompiled),
    // the engine should have updated UBlueprint::Status to reflect
    // the compile outcome.
    if (LastCompiledBlueprint.IsValid())
    {
        const EBlueprintStatus CurrentStatus = LastCompiledBlueprint->Status;
        FString DerivedResult;

        switch (CurrentStatus)
        {
        case BS_UpToDate:
        case BS_UpToDateWithWarnings:
            DerivedResult = TEXT("success");
            break;
        case BS_Error:
            DerivedResult = TEXT("failed");
            break;
        case BS_Dirty:
            // BS_Dirty after OnCompiled() → compilation likely failed
            // and the blueprint remained in a dirty state.  However,
            // BS_Dirty can also mean "edited but not yet compiled."
            // In the context of an OnCompiled event, failed is the
            // more likely interpretation.  If user testing shows this
            // is wrong, BS_Dirty can be moved to "unknown".
            DerivedResult = TEXT("failed");
            break;
        default:
            // BS_Unknown, BS_BeingCreated — do not fabricate.
            DerivedResult = TEXT("unknown");
            break;
        }

        CachedLastCompileResult = DerivedResult;

        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("[BP Compile] OnDeferredTick: %s — deferred Status=%d → result=\"%s\""),
            *LastCompiledBlueprint->GetName(),
            static_cast<int32>(CurrentStatus),
            *DerivedResult);
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Warning,
            TEXT("[BP Compile] OnDeferredTick: stashed BP is no longer valid "
                 "(GC'd between compile event and deferred tick)"));
    }

    // Clear the handle — this is a one-shot tick.
    PendingDeferredHandle.Reset();

    return false;  // do not re-tick
}

// ═══════════════════════════════════════════════════════════════
// Compile status queries (thread-safe reads)
// ═══════════════════════════════════════════════════════════════

bool OmueBlueprintCompileReadCollector::IsCompiling() const
{
    FScopeLock Lock(&CacheLock);
    return InFlightBlueprints.Num() > 0;
}

FString OmueBlueprintCompileReadCollector::GetLastCompileResult() const
{
    FScopeLock Lock(&CacheLock);
    return CachedLastCompileResult;
}

int32 OmueBlueprintCompileReadCollector::GetErrorCount() const
{
    FScopeLock Lock(&CacheLock);
    return CachedErrorCount;
}

int32 OmueBlueprintCompileReadCollector::GetWarningCount() const
{
    FScopeLock Lock(&CacheLock);
    return CachedWarningCount;
}

TArray<FString> OmueBlueprintCompileReadCollector::GetLastErrors() const
{
    FScopeLock Lock(&CacheLock);
    TArray<FString> Result;
    for (const FCachedIssue& Issue : CachedLastIssues)
    {
        const FString SeverityStr = Issue.bIsError ? TEXT("error") : TEXT("warning");
        FString SafeMessage = Issue.Message;
        SafeMessage.ReplaceInline(TEXT("\\"), TEXT("\\\\"));
        SafeMessage.ReplaceInline(TEXT("\""), TEXT("\\\""));
        Result.Add(FString::Printf(
            TEXT("{\"code\":\"\",\"message\":\"%s\",\"severity\":\"%s\"}"),
            *SafeMessage, *SeverityStr));
    }
    return Result;
}

FString OmueBlueprintCompileReadCollector::GetLastCompileTime() const
{
    FScopeLock Lock(&CacheLock);
    return CachedLastCompileTime;
}
