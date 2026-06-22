// Copyright OMUE. All Rights Reserved.

#include "OmueUnrealBridgeModule.h"
#include "OmueHttpServer.h"
#include "OmueLogCollector.h"
#include "OmueKismetReadinessProbe.h"
#include "OmueBlueprintCompileReadCollector.h"
#include "OmueBehaviorTreeReadCollector.h"

DEFINE_LOG_CATEGORY(LogOmueUnrealBridge);

// File-static BT collector instance. Managed manually in StartupModule /
// ShutdownModule to avoid modifying the module header.  The collector is
// stateless (no Start/Stop needed), so a file-static is sufficient.
static TUniquePtr<OmueBehaviorTreeReadCollector> GBTCollector;

// ── Construction / Destruction ──────────────────────────────────
// Destructor is defined here (not in the header) so that the
// TUniquePtr destructors see the complete types.

FOmueUnrealBridgeModule::FOmueUnrealBridgeModule() = default;
FOmueUnrealBridgeModule::~FOmueUnrealBridgeModule() = default;

// ── Module Lifecycle ────────────────────────────────────────────

void FOmueUnrealBridgeModule::StartupModule()
{
    UE_LOG(LogOmueUnrealBridge, Log,
        TEXT("OMUE Unreal Bridge module starting..."));

    // 1. Start log collector before HTTP server so that startup logs
    //    (including route registration messages) are captured.
    LogCollector = MakeUnique<OmueLogCollector>(/*Capacity=*/500);
    LogCollector->Start();

    // 2. Start BP compile read collector — subscribes to Kismet
    //    delegate events for Blueprint compile status observation.
    //    No Blueprint structure is read.  No compilation is triggered.
    //
    //    Start() handles the case where GEditor is not yet available
    //    (module loaded before editor init) by deferring via FTSTicker
    //    retry.  See OmueBlueprintCompileReadCollector::OnStartRetryTick().
    CompileReadCollector = MakeUnique<OmueBlueprintCompileReadCollector>();
    CompileReadCollector->Start();

    // 3. Create BT read collector (stateless, no Start() needed).
    GBTCollector = MakeUnique<OmueBehaviorTreeReadCollector>();

    // 4. Make the collectors available to HTTP handlers.
    OmueSetLogCollector(LogCollector.Get());
    OmueSetCompileReadCollector(CompileReadCollector.Get());
    OmueSetBehaviorTreeReadCollector(GBTCollector.Get());

    // 4. Start HTTP server.
    HttpServer = MakeUnique<OmueHttpServer>();

    // 5. K0: Kismet readiness probe — confirms Kismet module is
    //    linked and accessible.  No delegate subscription.  No side
    //    effects.  Only writes one UE_LOG line.
    FOmueKismetReadinessProbe::Probe();

    if (HttpServer->Start(21805))
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("HTTP server started on 127.0.0.1:21805"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to start HTTP server on 127.0.0.1:21805. "
                 "Port may be in use or HTTPServer module unavailable. "
                 "The plugin will load but endpoints will not be available."));
        // Do NOT crash the Editor. Plugin continues in degraded mode.
    }
}

void FOmueUnrealBridgeModule::ShutdownModule()
{
    // 1. Stop HTTP server first — handlers might still reference
    //    the collectors.
    if (HttpServer)
    {
        HttpServer->Stop();
        HttpServer.Reset();
    }

    // 2. Clear collector singletons so no dangling pointers
    //    remain for any late handler invocations.
    OmueSetBehaviorTreeReadCollector(nullptr);
    OmueSetCompileReadCollector(nullptr);
    OmueSetLogCollector(nullptr);

    // 3. Stop the BP compile read collector — unsubscribes
    //    Kismet delegates.
    if (CompileReadCollector)
    {
        CompileReadCollector->Stop();
        CompileReadCollector.Reset();
    }

    // 4. Destroy the BT read collector (stateless, no Stop() needed).
    GBTCollector.Reset();

    // 5. Stop the log collector.
    if (LogCollector)
    {
        LogCollector->Stop();
        LogCollector.Reset();
    }

    UE_LOG(LogOmueUnrealBridge, Log,
        TEXT("OMUE Unreal Bridge module shutdown."));
}

IMPLEMENT_MODULE(FOmueUnrealBridgeModule, OmueUnrealBridge)
