// Copyright OMUE. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

// Forward declarations — full types are in respective Private/*.cpp.
class OmueHttpServer;
class OmueLogCollector;
class OmueBlueprintCompileReadCollector;

/**
 * OmueUnrealBridge Editor Module
 *
 * Phase K1: manages OmueLogCollector, OmueBlueprintCompileReadCollector,
 * and OmueHttpServer lifecycles.
 * - StartupModule():
 *     1. Creates and starts OmueLogCollector (begins log capture).
 *     2. Creates and starts OmueBlueprintCompileReadCollector (BP compile events).
 *     3. Sets collector singletons for HTTP handlers.
 *     4. Creates and starts OmueHttpServer on 127.0.0.1:21805.
 * - ShutdownModule():
 *     1. Stops and destroys OmueHttpServer.
 *     2. Clears collector singletons.
 *     3. Stops and destroys OmueBlueprintCompileReadCollector.
 *     4. Stops and destroys OmueLogCollector.
 * - No assets are modified. No compilation is triggered.
 */
class FOmueUnrealBridgeModule : public IModuleInterface
{
public:
    FOmueUnrealBridgeModule();
    virtual ~FOmueUnrealBridgeModule();

    /** IModuleInterface implementation */
    virtual void StartupModule() override;
    virtual void ShutdownModule() override;

private:
    TUniquePtr<OmueHttpServer> HttpServer;
    TUniquePtr<OmueLogCollector> LogCollector;
    TUniquePtr<OmueBlueprintCompileReadCollector> CompileReadCollector;
};

DECLARE_LOG_CATEGORY_EXTERN(LogOmueUnrealBridge, Log, All);
