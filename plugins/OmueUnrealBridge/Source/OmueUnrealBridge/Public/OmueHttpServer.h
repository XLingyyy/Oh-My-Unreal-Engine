// Copyright OMUE. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "HttpRouteHandle.h"

// Forward declarations — full includes are in the .cpp to keep
// HTTPServer implementation types out of the module's public interface.
class IHttpRouter;
class OmueLogCollector;
class OmueBlueprintCompileReadCollector;
class OmueBehaviorTreeReadCollector;

/**
 * Minimal local HTTP server for OMUE Unreal Bridge.
 *
 * Phase B: GET /health.
 * Phase C: GET /context/project.
 * Phase E: GET /context/current-asset.
 * Phase G1: GET /logs/recent.
 * Phase H1: GET /compile/status.
 * Phase K1: /compile/status now powered by OmueBlueprintCompileReadCollector.
 * Phase K2a: GET /context/blueprint-summary.
 * Phase K2b-1: GET /context/blueprint-graphs.
 * Phase K2b-2b: GET /context/blueprint-graph-detail.
 *
 * Phase E62: GET /context/behavior-tree-diagnostic.
 * Phase E71: POST /write/scratch + POST /write/scratch/rollback.
 *
 * All handler functions are file-static in OmueHttpServer.cpp so that
 * FHttpResultCallback (a UE typedef, NOT a class) stays out of the
 * public header.
 *
 * Uses UE 5.7.4 HTTPServer API:
 *   FHttpServerModule::GetHttpRouter(Port) + StartAllListeners
 */
class OmueHttpServer
{
public:
    OmueHttpServer();
    ~OmueHttpServer();

    // Non-copyable, non-movable.
    OmueHttpServer(const OmueHttpServer&) = delete;
    OmueHttpServer& operator=(const OmueHttpServer&) = delete;

    /**
     * Create a router for the given port, register routes,
     * and start all listeners.
     *
     * @param InPort  Port to bind (default: 21805).
     * @return true if the router was created and listeners started.
     */
    bool Start(uint16 InPort);

    /** Stop all listeners and release the router. Safe when not running (no-op). */
    void Stop();

    /** Returns true if the listener is currently running. */
    bool IsRunning() const;

private:
    /** Register all HTTP routes. Called once from Start(). */
    void RegisterRoutes();

    /** Helper: unbind a single route handle if valid. */
    void UnbindRoute(FHttpRouteHandle& Handle);

    TSharedPtr<IHttpRouter> Router;
    FHttpRouteHandle HealthRouteHandle;
    FHttpRouteHandle HealthOptionsRouteHandle;
    FHttpRouteHandle ProjectContextRouteHandle;
    FHttpRouteHandle ProjectContextOptionsRouteHandle;
    FHttpRouteHandle CurrentAssetRouteHandle;
    FHttpRouteHandle CurrentAssetOptionsRouteHandle;
    FHttpRouteHandle LogsRecentRouteHandle;
    FHttpRouteHandle LogsRecentOptionsRouteHandle;
    FHttpRouteHandle CompileStatusRouteHandle;
    FHttpRouteHandle CompileStatusOptionsRouteHandle;
    FHttpRouteHandle BlueprintSummaryRouteHandle;
    FHttpRouteHandle BlueprintSummaryOptionsRouteHandle;
    FHttpRouteHandle BlueprintGraphsRouteHandle;
    FHttpRouteHandle BlueprintGraphsOptionsRouteHandle;
    FHttpRouteHandle BlueprintGraphDetailRouteHandle;
    FHttpRouteHandle BlueprintGraphDetailOptionsRouteHandle;
    FHttpRouteHandle BehaviorTreeDiagnosticRouteHandle;
    FHttpRouteHandle BehaviorTreeDiagnosticOptionsRouteHandle;
    FHttpRouteHandle CapabilitiesRouteHandle;
    FHttpRouteHandle CapabilitiesOptionsRouteHandle;
    FHttpRouteHandle WriteScratchRouteHandle;
    FHttpRouteHandle WriteScratchOptionsRouteHandle;
    FHttpRouteHandle WriteScratchRollbackRouteHandle;
    FHttpRouteHandle WriteScratchRollbackOptionsRouteHandle;
    FHttpRouteHandle WriteScratchDuplicateRouteHandle;
    FHttpRouteHandle WriteScratchDuplicateOptionsRouteHandle;
    FHttpRouteHandle WriteScratchSandboxApplyRouteHandle;
    FHttpRouteHandle WriteScratchSandboxApplyOptionsRouteHandle;
    FHttpRouteHandle CompileBlueprintRouteHandle;
    FHttpRouteHandle CompileBlueprintOptionsRouteHandle;
    bool bIsRunning = false;
};

/**
 * Provide the log collector singleton to OmueHttpServer.cpp handlers.
 *
 * Called once from FOmueUnrealBridgeModule::StartupModule() before
 * routes are registered.  Pass nullptr to clear (shutdown).
 */
void OmueSetLogCollector(OmueLogCollector* InCollector);

/**
 * Provide the BP compile read collector singleton to
 * OmueHttpServer.cpp handlers.
 *
 * Called once from FOmueUnrealBridgeModule::StartupModule() before
 * routes are registered.  Pass nullptr to clear (shutdown).
 */
void OmueSetCompileReadCollector(OmueBlueprintCompileReadCollector* InCollector);

/**
 * Provide the BT read collector singleton to OmueHttpServer.cpp handlers.
 *
 * Called once from FOmueUnrealBridgeModule::StartupModule() before
 * routes are registered.  Pass nullptr to clear (shutdown).
 */
void OmueSetBehaviorTreeReadCollector(OmueBehaviorTreeReadCollector* InCollector);
