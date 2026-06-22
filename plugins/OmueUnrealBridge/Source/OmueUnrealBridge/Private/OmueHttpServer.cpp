// Copyright OMUE. All Rights Reserved.
//
// Phase C — UE 5.7.4 API:
//   FHttpServerModule::GetHttpRouter(Port, bFailOnBindFailure)
//   FHttpServerModule::StartAllListeners / StopAllListeners
//   IHttpRouter::BindRoute → FHttpRouteHandle
//   FHttpServerResponse::Create / ::Error
//   EHttpServerResponseCodes: Ok, ServerError, ServiceUnavail
//   FHttpResultCallback is a typedef (NOT a class)

#include "OmueHttpServer.h"
#include "OmueUnrealBridgeModule.h"
#include "OmueProjectContextCollector.h"
#include "OmueAssetContextCollector.h"
#include "OmueLogCollector.h"
#include "OmueCompileStatusCollector.h"
#include "OmueBlueprintCompileReadCollector.h"
#include "OmueBlueprintSummaryCollector.h"
#include "OmueBlueprintStructureReadCollector.h"
#include "OmueBehaviorTreeReadCollector.h"

#include "HttpServerModule.h"
#include "IHttpRouter.h"
#include "HttpPath.h"
#include "HttpServerRequest.h"
#include "HttpServerResponse.h"
#include "HttpResultCallback.h"
#include "HttpRequestHandler.h"

#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Serialization/JsonWriter.h"
#include "Serialization/JsonSerializer.h"

#include "Engine/Blueprint.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "HAL/PlatformTime.h"
#include "IMessageLogListing.h"
#include "Kismet2/BlueprintEditorUtils.h"
#include "Kismet2/CompilerResultsLog.h"
#include "Kismet2/KismetEditorUtilities.h"
#include "Logging/TokenizedMessage.h"
#include "Misc/DateTime.h"
#include "Misc/DefaultValueHelper.h"
#include "Misc/Guid.h"
#include "UObject/UObjectGlobals.h"

// E85 metadata mutation: FMetaData (modern replacement for UDEPRECATED_MetaData)
// is the current UE 5.7 metadata system, owned by UPackage.
//   FMetaData::FindValue(Object, Key) → const FString* (nullptr if absent)
//   FMetaData::SetValue(Object, Key, Value)  → void
//   FMetaData::GetValue(Object, Key) → const FString& (empty if absent)
// APIs confirmed from UE 5.7 headers:
//   UObjectBaseUtility::MarkPackageDirty() @ UObjectBaseUtility.h:513
//   UObject::Modify(bool) @ Object.h:308
//   UPackage::GetMetaData() → FMetaData& @ Package.h:1154
//   FMetaData @ MetaData.h (within #if WITH_METADATA)
#include "UObject/MetaData.h"
#include "UObject/Package.h"

// ── Plugin version (matches .uplugin VersionName) ──────────────
static const TCHAR* BridgeVersion = TEXT("0.1.0");

// ── Log collector singleton (set by module before Start()) ─────
static OmueLogCollector* GLogCollector = nullptr;

void OmueSetLogCollector(OmueLogCollector* InCollector)
{
    GLogCollector = InCollector;
}

// ── Compile read collector singleton (set by module before Start()) ─
static OmueBlueprintCompileReadCollector* GCompileReadCollector = nullptr;

void OmueSetCompileReadCollector(OmueBlueprintCompileReadCollector* InCollector)
{
    GCompileReadCollector = InCollector;
}

// ── BT read collector singleton (set by module before Start()) ────
static OmueBehaviorTreeReadCollector* GBehaviorTreeReadCollector = nullptr;

void OmueSetBehaviorTreeReadCollector(OmueBehaviorTreeReadCollector* InCollector)
{
    GBehaviorTreeReadCollector = InCollector;
}

// ═══════════════════════════════════════════════════════════════
// CORS helper — add permissive headers for local development.
//
// Phase D fix: UE bridge responses lacked CORS headers, causing
// renderer-side fetch() from Vite dev server (localhost:5173) to
// fail with cross-origin errors even though browser address-bar
// access worked fine (browser allows direct navigation, but
// enforces CORS for in-page fetch).
//
// Allow-Origin: * is acceptable because the HTTP server binds
// 127.0.0.1 only — no external network exposure.
// ═══════════════════════════════════════════════════════════════

// UE 5.7.4: FHttpServerResponse::Headers is TMap<FString, TArray<FString>>,
// so each header value must be a TArray, not a plain FString.
static void SetResponseHeader(
    TUniquePtr<FHttpServerResponse>& Response,
    const FString& Name,
    const FString& Value)
{
    TArray<FString>& Values = Response->Headers.FindOrAdd(Name);
    Values.Reset();
    Values.Add(Value);
}

static void AddCorsHeaders(TUniquePtr<FHttpServerResponse>& Response)
{
    SetResponseHeader(Response, TEXT("Access-Control-Allow-Origin"), TEXT("*"));
    SetResponseHeader(Response, TEXT("Access-Control-Allow-Methods"), TEXT("GET, POST, OPTIONS"));
    SetResponseHeader(Response, TEXT("Access-Control-Allow-Headers"), TEXT("Content-Type, Accept"));
    SetResponseHeader(Response, TEXT("Access-Control-Max-Age"), TEXT("86400"));
}

// ═══════════════════════════════════════════════════════════════
// Helper: serialize a FJsonObject → JSON string and send response.
// Reduces duplication between the two handlers.
// ═══════════════════════════════════════════════════════════════

/** Serialize a JsonObject and send via OnComplete. Returns true on success. */
static bool SendJsonResponse(
    const TSharedPtr<FJsonObject>& RootObj,
    const FHttpResultCallback& OnComplete,
    const TCHAR* ErrorContext)
{
    FString BodyString;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&BodyString);

    if (!FJsonSerializer::Serialize(RootObj.ToSharedRef(), Writer))
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("%s: JSON serialization failed"), ErrorContext);

        auto ErrorResponse = FHttpServerResponse::Error(
            EHttpServerResponseCodes::ServerError,
            TEXT("INTERNAL_ERROR"),
            TEXT("JSON serialization failed"));
        AddCorsHeaders(ErrorResponse);
        OnComplete(MoveTemp(ErrorResponse));
        return false;
    }
    Writer->Close();

    auto Response = FHttpServerResponse::Create(
        BodyString,
        TEXT("application/json; charset=utf-8"));
    AddCorsHeaders(Response);
    OnComplete(MoveTemp(Response));
    return true;
}

// ═══════════════════════════════════════════════════════════════
// GET /health handler — file-static to keep FHttpResultCallback
// out of the public header.
// ═══════════════════════════════════════════════════════════════

static bool HandleHealthRequest(
    const FHttpServerRequest& Request,
    const FHttpResultCallback& OnComplete)
{
    TSharedPtr<FJsonObject> RootObj = MakeShareable(new FJsonObject);
    RootObj->SetBoolField(TEXT("success"), true);

    TSharedPtr<FJsonObject> DataObj = MakeShareable(new FJsonObject);
    DataObj->SetStringField(TEXT("status"), TEXT("ok"));
    DataObj->SetStringField(TEXT("bridgeVersion"), BridgeVersion);
    DataObj->SetStringField(TEXT("editorStatus"), TEXT("unknown"));
    DataObj->SetNumberField(TEXT("uptime"), 0);

    RootObj->SetObjectField(TEXT("data"), DataObj);
    RootObj->SetStringField(TEXT("timestamp"), FDateTime::UtcNow().ToIso8601());

    SendJsonResponse(RootObj, OnComplete, TEXT("HandleHealth"));
    return true;
}

// ═══════════════════════════════════════════════════════════════
// GET /context/project handler
// ═══════════════════════════════════════════════════════════════

static bool HandleProjectContextRequest(
    const FHttpServerRequest& Request,
    const FHttpResultCallback& OnComplete)
{
    OmueProjectContextCollector Collector;

    TSharedPtr<FJsonObject> RootObj = MakeShareable(new FJsonObject);
    RootObj->SetBoolField(TEXT("success"), true);

    TSharedPtr<FJsonObject> DataObj = MakeShareable(new FJsonObject);
    DataObj->SetStringField(TEXT("projectName"), Collector.GetProjectName());
    DataObj->SetStringField(TEXT("projectPath"), Collector.GetProjectPath());
    DataObj->SetStringField(TEXT("uprojectFile"), Collector.GetUprojectFile());
    DataObj->SetStringField(TEXT("engineVersion"), Collector.GetEngineVersion());
    DataObj->SetStringField(TEXT("editorStatus"), Collector.GetEditorStatus());

    // modules[] and targetPlatforms[] intentionally omitted.
    // These require project-descriptor parsing or module-manager queries
    // that are beyond Phase C's scope.

    RootObj->SetObjectField(TEXT("data"), DataObj);
    RootObj->SetStringField(TEXT("timestamp"), FDateTime::UtcNow().ToIso8601());

    SendJsonResponse(RootObj, OnComplete, TEXT("HandleProjectContext"));
    return true;
}

// ═══════════════════════════════════════════════════════════════
// GET /context/current-asset handler (Phase E)
//
// Returns the first Content-Browser-selected asset.
// No selection → success:true with selectedAsset:null.
// Aligns with shared-protocol CurrentAssetData:
//   { selectedAsset?: AssetContext; openAssets: AssetContext[] }
//
// openAssets is always [] in Phase E — enumerating all open asset
// editors requires iterating UAssetEditorSubsystem which is deferred.
// ═══════════════════════════════════════════════════════════════

static bool HandleCurrentAssetRequest(
    const FHttpServerRequest& Request,
    const FHttpResultCallback& OnComplete)
{
    OmueAssetContextCollector Collector;

    TSharedPtr<FJsonObject> RootObj = MakeShareable(new FJsonObject);
    RootObj->SetBoolField(TEXT("success"), true);

    TSharedPtr<FJsonObject> DataObj = MakeShareable(new FJsonObject);

    FOmueAssetInfo AssetInfo;
    if (Collector.TryGetSelectedAsset(AssetInfo))
    {
        TSharedPtr<FJsonObject> AssetObj = MakeShareable(new FJsonObject);
        AssetObj->SetStringField(TEXT("assetName"), AssetInfo.AssetName);
        AssetObj->SetStringField(TEXT("assetPath"), AssetInfo.AssetPath);
        AssetObj->SetStringField(TEXT("assetClass"), AssetInfo.AssetClass);
        AssetObj->SetStringField(TEXT("packagePath"), AssetInfo.PackagePath);
        AssetObj->SetBoolField(TEXT("isDirty"), AssetInfo.bIsDirty);
        AssetObj->SetBoolField(TEXT("isSelected"), true);
        AssetObj->SetBoolField(TEXT("isOpenInEditor"), AssetInfo.bIsOpenInEditor);

        DataObj->SetObjectField(TEXT("selectedAsset"), AssetObj);
    }
    else
    {
        DataObj->SetField(TEXT("selectedAsset"),
            MakeShareable(new FJsonValueNull));
    }

    // openAssets[] — deferred to later phase.
    TArray<TSharedPtr<FJsonValue>> EmptyAssets;
    DataObj->SetArrayField(TEXT("openAssets"), EmptyAssets);

    RootObj->SetObjectField(TEXT("data"), DataObj);
    RootObj->SetStringField(TEXT("timestamp"), FDateTime::UtcNow().ToIso8601());

    SendJsonResponse(RootObj, OnComplete, TEXT("HandleCurrentAsset"));
    return true;
}

// ═══════════════════════════════════════════════════════════════
// GET /logs/recent handler (Phase G1)
//
// Returns the most recent log entries captured since plugin startup.
// Query param: ?count=N  (default 50, max 200, min 1)
//
// Uses the module-level GLogCollector singleton.  If the collector
// has not been started (shouldn't happen in normal operation) the
// response is success:true with an empty entries array.
// ═══════════════════════════════════════════════════════════════

static bool HandleLogsRecentRequest(
    const FHttpServerRequest& Request,
    const FHttpResultCallback& OnComplete)
{
    // ── Parse count query param ──────────────────────────────
    int32 Count = 50;  // default

    if (const FString* CountStr = Request.QueryParams.Find(TEXT("count")))
    {
        if (!CountStr->IsEmpty())
        {
            int32 Parsed = FCString::Atoi(**CountStr);
            if (Parsed > 0)
            {
                Count = FMath::Min(Parsed, 200);
            }
            // If Parsed <= 0, keep the default 50.
        }
    }

    TSharedPtr<FJsonObject> RootObj = MakeShareable(new FJsonObject);
    RootObj->SetBoolField(TEXT("success"), true);

    TSharedPtr<FJsonObject> DataObj = MakeShareable(new FJsonObject);

    TArray<FOmueLogEntry> Entries;
    if (GLogCollector)
    {
        GLogCollector->GetRecentLogs(Count, Entries);
    }

    TArray<TSharedPtr<FJsonValue>> JsonEntries;
    JsonEntries.Reserve(Entries.Num());

    for (const FOmueLogEntry& E : Entries)
    {
        TSharedPtr<FJsonObject> EntryObj = MakeShareable(new FJsonObject);
        EntryObj->SetStringField(TEXT("timestamp"), E.Timestamp);
        EntryObj->SetStringField(TEXT("category"),  E.Category);
        EntryObj->SetStringField(TEXT("verbosity"), E.Verbosity);
        EntryObj->SetStringField(TEXT("message"),   E.Message);

        JsonEntries.Add(MakeShareable(new FJsonValueObject(EntryObj)));
    }

    DataObj->SetArrayField(TEXT("entries"), JsonEntries);
    // totalCount is optional in shared-protocol RecentLogsData;
    // omit it for now — the array length is sufficient for Phase G1.
    RootObj->SetObjectField(TEXT("data"), DataObj);
    RootObj->SetStringField(TEXT("timestamp"), FDateTime::UtcNow().ToIso8601());

    SendJsonResponse(RootObj, OnComplete, TEXT("HandleLogsRecent"));
    return true;
}

// ═══════════════════════════════════════════════════════════════
// GET /compile/status handler (Phase H1 → K1)
//
// K1: delegate-driven Blueprint compile status.
//
// If the OmueBlueprintCompileReadCollector singleton is available
// (module has started it), the handler reads the cached compile
// status — isCompiling, lastCompileResult, lastCompileTime —
// from the most recent Blueprint compilation event.
//
// If the singleton is null (module not yet ready, or shutdown),
// the handler falls back to the old conservative defaults.
//
// errorCount / warningCount remain 0 in K1 (deferred to FMessageLog).
// lastErrors remains empty.
// No compilation is triggered.
// ═══════════════════════════════════════════════════════════════

static bool HandleCompileStatusRequest(
    const FHttpServerRequest& Request,
    const FHttpResultCallback& OnComplete)
{
    TSharedPtr<FJsonObject> RootObj = MakeShareable(new FJsonObject);
    RootObj->SetBoolField(TEXT("success"), true);

    TSharedPtr<FJsonObject> DataObj = MakeShareable(new FJsonObject);

    if (GCompileReadCollector)
    {
        // ── K1: live data from delegate-driven collector ────────
        DataObj->SetBoolField(TEXT("isCompiling"),
            GCompileReadCollector->IsCompiling());
        DataObj->SetStringField(TEXT("lastCompileResult"),
            GCompileReadCollector->GetLastCompileResult());
        DataObj->SetNumberField(TEXT("errorCount"),
            static_cast<double>(GCompileReadCollector->GetErrorCount()));
        DataObj->SetNumberField(TEXT("warningCount"),
            static_cast<double>(GCompileReadCollector->GetWarningCount()));

        const FString LastTime = GCompileReadCollector->GetLastCompileTime();
        if (!LastTime.IsEmpty())
        {
            DataObj->SetStringField(TEXT("lastCompileTime"), LastTime);
        }
    }
    else
    {
        // ── Fallback: conservative defaults (same as old H1) ────
        DataObj->SetBoolField(TEXT("isCompiling"), false);
        DataObj->SetStringField(TEXT("lastCompileResult"), TEXT("unknown"));
        DataObj->SetNumberField(TEXT("errorCount"), 0.0);
        DataObj->SetNumberField(TEXT("warningCount"), 0.0);
    }

    TArray<TSharedPtr<FJsonValue>> LastErrorsArray;
    if (GCompileReadCollector)
    {
        TArray<FString> RawErrors = GCompileReadCollector->GetLastErrors();
        for (const FString& IssueJson : RawErrors)
        {
            TSharedPtr<FJsonObject> IssueObj;
            TSharedRef<TJsonReader<>> IssueReader = TJsonReaderFactory<>::Create(IssueJson);
            if (FJsonSerializer::Deserialize(IssueReader, IssueObj) && IssueObj.IsValid())
            {
                LastErrorsArray.Add(MakeShared<FJsonValueObject>(IssueObj));
            }
        }
    }
    DataObj->SetArrayField(TEXT("lastErrors"), LastErrorsArray);

    RootObj->SetObjectField(TEXT("data"), DataObj);
    RootObj->SetStringField(TEXT("timestamp"), FDateTime::UtcNow().ToIso8601());

    SendJsonResponse(RootObj, OnComplete, TEXT("HandleCompileStatus"));
    return true;
}

// ═══════════════════════════════════════════════════════════════
// GET /context/blueprint-summary handler (Phase K2a)
//
// Returns top-level read-only summary of the first Content-Browser-
// selected Blueprint.  No selection or non-Blueprint selection →
// success:true with selectedBlueprint:null.
//
// The summary includes name, path, class, type, status, and name-level
// lists of graphs, variables, functions, and macros.
// No node-graph traversal.  No asset modification.
// ═══════════════════════════════════════════════════════════════

static bool HandleBlueprintSummaryRequest(
    const FHttpServerRequest& Request,
    const FHttpResultCallback& OnComplete)
{
    OmueBlueprintSummaryCollector Collector;

    TSharedPtr<FJsonObject> RootObj = MakeShareable(new FJsonObject);
    RootObj->SetBoolField(TEXT("success"), true);

    TSharedPtr<FJsonObject> DataObj = MakeShareable(new FJsonObject);

    FOmueBlueprintSummary Summary;
    if (Collector.TryGetBlueprintSummary(Summary))
    {
        TSharedPtr<FJsonObject> BPObj = MakeShareable(new FJsonObject);
        BPObj->SetStringField(TEXT("name"), Summary.Name);
        BPObj->SetStringField(TEXT("packagePath"), Summary.PackagePath);
        BPObj->SetStringField(TEXT("objectPath"), Summary.ObjectPath);
        BPObj->SetStringField(TEXT("assetClass"), Summary.AssetClass);
        BPObj->SetStringField(TEXT("parentClassName"), Summary.ParentClassName);
        BPObj->SetStringField(TEXT("generatedClassName"), Summary.GeneratedClassName);
        BPObj->SetStringField(TEXT("skeletonClassName"), Summary.SkeletonClassName);
        BPObj->SetStringField(TEXT("blueprintType"), Summary.BlueprintType);
        BPObj->SetStringField(TEXT("status"), Summary.Status);
        BPObj->SetBoolField(TEXT("isDataOnly"), Summary.bIsDataOnly);
        BPObj->SetBoolField(TEXT("isDirty"), Summary.bIsDirty);
        BPObj->SetNumberField(TEXT("graphCount"),
            static_cast<double>(Summary.GraphCount));
        BPObj->SetNumberField(TEXT("variableCount"),
            static_cast<double>(Summary.VariableCount));
        BPObj->SetNumberField(TEXT("functionCount"),
            static_cast<double>(Summary.FunctionCount));
        BPObj->SetNumberField(TEXT("macroCount"),
            static_cast<double>(Summary.MacroCount));

        // ── graphs[] ───────────────────────────────────────────
        {
            TArray<TSharedPtr<FJsonValue>> JsonGraphs;
            JsonGraphs.Reserve(Summary.Graphs.Num());
            for (const FOmueGraphSummary& G : Summary.Graphs)
            {
                TSharedPtr<FJsonObject> GObj = MakeShareable(new FJsonObject);
                GObj->SetStringField(TEXT("name"), G.Name);
                GObj->SetStringField(TEXT("kind"), G.Kind);
                JsonGraphs.Add(MakeShareable(new FJsonValueObject(GObj)));
            }
            BPObj->SetArrayField(TEXT("graphs"), JsonGraphs);
        }

        // ── variables[] ────────────────────────────────────────
        {
            TArray<TSharedPtr<FJsonValue>> JsonVars;
            JsonVars.Reserve(Summary.Variables.Num());
            for (const FOmueVariableSummary& V : Summary.Variables)
            {
                TSharedPtr<FJsonObject> VObj = MakeShareable(new FJsonObject);
                VObj->SetStringField(TEXT("name"), V.Name);
                VObj->SetStringField(TEXT("category"), V.Category);
                JsonVars.Add(MakeShareable(new FJsonValueObject(VObj)));
            }
            BPObj->SetArrayField(TEXT("variables"), JsonVars);
        }

        // ── functions[] ────────────────────────────────────────
        {
            TArray<TSharedPtr<FJsonValue>> JsonFuncs;
            JsonFuncs.Reserve(Summary.Functions.Num());
            for (const FOmueFunctionSummary& F : Summary.Functions)
            {
                TSharedPtr<FJsonObject> FObj = MakeShareable(new FJsonObject);
                FObj->SetStringField(TEXT("name"), F.Name);
                JsonFuncs.Add(MakeShareable(new FJsonValueObject(FObj)));
            }
            BPObj->SetArrayField(TEXT("functions"), JsonFuncs);
        }

        // ── macros[] ───────────────────────────────────────────
        {
            TArray<TSharedPtr<FJsonValue>> JsonMacros;
            JsonMacros.Reserve(Summary.Macros.Num());
            for (const FOmueMacroSummary& M : Summary.Macros)
            {
                TSharedPtr<FJsonObject> MObj = MakeShareable(new FJsonObject);
                MObj->SetStringField(TEXT("name"), M.Name);
                JsonMacros.Add(MakeShareable(new FJsonValueObject(MObj)));
            }
            BPObj->SetArrayField(TEXT("macros"), JsonMacros);
        }

        DataObj->SetObjectField(TEXT("selectedBlueprint"), BPObj);
    }
    else
    {
        DataObj->SetField(TEXT("selectedBlueprint"),
            MakeShareable(new FJsonValueNull));
    }

    RootObj->SetObjectField(TEXT("data"), DataObj);
    RootObj->SetStringField(TEXT("timestamp"), FDateTime::UtcNow().ToIso8601());

    SendJsonResponse(RootObj, OnComplete, TEXT("HandleBlueprintSummary"));
    return true;
}

// ═══════════════════════════════════════════════════════════════
// GET /context/blueprint-graphs handler (Phase K2b-1)
//
// Returns graph structure summary of the first Content-Browser-
// selected Blueprint.  No selection or non-Blueprint selection →
// success:true with selectedBlueprint:null.
//
// The summary includes Blueprint metadata, per-graph node/link
// counts, variable/function/event/macro summaries.
// No node/pin/link detail arrays.  No asset modification.
// ═══════════════════════════════════════════════════════════════

static bool HandleBlueprintGraphsRequest(
    const FHttpServerRequest& Request,
    const FHttpResultCallback& OnComplete)
{
    OmueBlueprintStructureReadCollector Collector;

    TSharedPtr<FJsonObject> RootObj = MakeShareable(new FJsonObject);
    RootObj->SetBoolField(TEXT("success"), true);

    TSharedPtr<FJsonObject> DataObj = MakeShareable(new FJsonObject);

    FOmueBPStructureSummary Summary;
    if (Collector.TryGetBlueprintStructure(Summary))
    {
        TSharedPtr<FJsonObject> BPObj = MakeShareable(new FJsonObject);

        // ── exportMeta ──────────────────────────────────────────
        {
            TSharedPtr<FJsonObject> MetaObj = MakeShareable(new FJsonObject);
            MetaObj->SetStringField(TEXT("formatVersion"), Summary.ExportMeta.FormatVersion);
            MetaObj->SetStringField(TEXT("exportedAt"), Summary.ExportMeta.ExportedAt);
            MetaObj->SetStringField(TEXT("source"), Summary.ExportMeta.Source);
            MetaObj->SetStringField(TEXT("assetPath"), Summary.ExportMeta.AssetPath);

            TArray<TSharedPtr<FJsonValue>> EmptyIds;
            MetaObj->SetArrayField(TEXT("includedGraphIds"), EmptyIds);

            BPObj->SetObjectField(TEXT("exportMeta"), MetaObj);
        }

        // ── blueprint metadata ──────────────────────────────────
        {
            TSharedPtr<FJsonObject> BlueprintObj = MakeShareable(new FJsonObject);
            BlueprintObj->SetStringField(TEXT("name"), Summary.Name);
            BlueprintObj->SetStringField(TEXT("packagePath"), Summary.PackagePath);
            BlueprintObj->SetStringField(TEXT("objectPath"), Summary.ObjectPath);
            BlueprintObj->SetStringField(TEXT("assetClass"), Summary.AssetClass);
            BlueprintObj->SetStringField(TEXT("parentClassName"), Summary.ParentClassName);
            BlueprintObj->SetStringField(TEXT("generatedClassName"), Summary.GeneratedClassName);
            BlueprintObj->SetStringField(TEXT("skeletonClassName"), Summary.SkeletonClassName);
            BlueprintObj->SetStringField(TEXT("blueprintType"), Summary.BlueprintType);
            BlueprintObj->SetStringField(TEXT("status"), Summary.Status);
            BlueprintObj->SetBoolField(TEXT("isDataOnly"), Summary.bIsDataOnly);
            BlueprintObj->SetBoolField(TEXT("isDirty"), Summary.bIsDirty);
            BlueprintObj->SetNumberField(TEXT("graphCount"),
                static_cast<double>(Summary.GraphCount));
            BlueprintObj->SetNumberField(TEXT("variableCount"),
                static_cast<double>(Summary.VariableCount));
            BlueprintObj->SetNumberField(TEXT("functionCount"),
                static_cast<double>(Summary.FunctionCount));
            BlueprintObj->SetNumberField(TEXT("eventCount"),
                static_cast<double>(Summary.EventCount));
            BlueprintObj->SetNumberField(TEXT("macroCount"),
                static_cast<double>(Summary.MacroCount));
            BlueprintObj->SetNumberField(TEXT("totalNodeCount"),
                static_cast<double>(Summary.TotalNodeCount));
            BlueprintObj->SetNumberField(TEXT("totalLinkCount"),
                static_cast<double>(Summary.TotalLinkCount));

            BPObj->SetObjectField(TEXT("blueprint"), BlueprintObj);
        }

        // ── graphs[] ────────────────────────────────────────────
        {
            TArray<TSharedPtr<FJsonValue>> JsonGraphs;
            JsonGraphs.Reserve(Summary.Graphs.Num());
            for (const FOmueBPGraphInfo& G : Summary.Graphs)
            {
                TSharedPtr<FJsonObject> GObj = MakeShareable(new FJsonObject);
                GObj->SetStringField(TEXT("graphId"), G.GraphId);
                GObj->SetStringField(TEXT("name"), G.Name);
                GObj->SetStringField(TEXT("kind"), G.Kind);
                GObj->SetNumberField(TEXT("nodeCount"),
                    static_cast<double>(G.NodeCount));
                GObj->SetNumberField(TEXT("linkCount"),
                    static_cast<double>(G.LinkCount));
                GObj->SetBoolField(TEXT("isEntryGraph"), G.bIsEntryGraph);
                JsonGraphs.Add(MakeShareable(new FJsonValueObject(GObj)));
            }
            BPObj->SetArrayField(TEXT("graphs"), JsonGraphs);
        }

        // ── variables[] ─────────────────────────────────────────
        {
            TArray<TSharedPtr<FJsonValue>> JsonVars;
            JsonVars.Reserve(Summary.Variables.Num());
            for (const FOmueBPVariableInfo& V : Summary.Variables)
            {
                TSharedPtr<FJsonObject> VObj = MakeShareable(new FJsonObject);
                VObj->SetStringField(TEXT("name"), V.Name);
                VObj->SetStringField(TEXT("type"), V.Type);
                VObj->SetStringField(TEXT("category"), V.Category);
                VObj->SetBoolField(TEXT("isEditable"), V.bIsEditable);
                VObj->SetBoolField(TEXT("isExposed"), V.bIsExposed);
                VObj->SetBoolField(TEXT("isArray"), V.bIsArray);

                if (V.DefaultValue.IsEmpty())
                    VObj->SetField(TEXT("defaultValue"),
                        MakeShareable(new FJsonValueNull));
                else
                    VObj->SetStringField(TEXT("defaultValue"), V.DefaultValue);

                JsonVars.Add(MakeShareable(new FJsonValueObject(VObj)));
            }
            BPObj->SetArrayField(TEXT("variables"), JsonVars);
        }

        // ── functions[] ─────────────────────────────────────────
        {
            TArray<TSharedPtr<FJsonValue>> JsonFuncs;
            JsonFuncs.Reserve(Summary.Functions.Num());
            for (const FOmueBPFunctionInfo& F : Summary.Functions)
            {
                TSharedPtr<FJsonObject> FObj = MakeShareable(new FJsonObject);
                FObj->SetStringField(TEXT("name"), F.Name);
                FObj->SetStringField(TEXT("graphId"), F.GraphId);
                FObj->SetBoolField(TEXT("isOverride"), F.bIsOverride);
                FObj->SetBoolField(TEXT("isPure"), F.bIsPure);
                FObj->SetBoolField(TEXT("isConst"), F.bIsConst);

                // ── inputParams[] ────────────────────────────
                {
                    TArray<TSharedPtr<FJsonValue>> JsonParams;
                    JsonParams.Reserve(F.InputParams.Num());
                    for (const FOmueBPParamInfo& P : F.InputParams)
                    {
                        TSharedPtr<FJsonObject> PObj = MakeShareable(new FJsonObject);
                        PObj->SetStringField(TEXT("name"), P.Name);
                        PObj->SetStringField(TEXT("type"), P.Type);
                        PObj->SetBoolField(TEXT("isReturnValue"), false);
                        PObj->SetBoolField(TEXT("isReference"), P.bIsReference);
                        PObj->SetBoolField(TEXT("isArray"), P.bIsArray);
                        JsonParams.Add(MakeShareable(new FJsonValueObject(PObj)));
                    }
                    FObj->SetArrayField(TEXT("inputParams"), JsonParams);
                }

                // ── outputParams[] ───────────────────────────
                {
                    TArray<TSharedPtr<FJsonValue>> JsonParams;
                    JsonParams.Reserve(F.OutputParams.Num());
                    for (const FOmueBPParamInfo& P : F.OutputParams)
                    {
                        TSharedPtr<FJsonObject> PObj = MakeShareable(new FJsonObject);
                        PObj->SetStringField(TEXT("name"), P.Name);
                        PObj->SetStringField(TEXT("type"), P.Type);
                        PObj->SetBoolField(TEXT("isReturnValue"), true);
                        PObj->SetBoolField(TEXT("isReference"), P.bIsReference);
                        PObj->SetBoolField(TEXT("isArray"), P.bIsArray);
                        JsonParams.Add(MakeShareable(new FJsonValueObject(PObj)));
                    }
                    FObj->SetArrayField(TEXT("outputParams"), JsonParams);
                }

                FObj->SetNumberField(TEXT("nodeCount"),
                    static_cast<double>(F.NodeCount));
                JsonFuncs.Add(MakeShareable(new FJsonValueObject(FObj)));
            }
            BPObj->SetArrayField(TEXT("functions"), JsonFuncs);
        }

        // ── events[] ────────────────────────────────────────────
        {
            TArray<TSharedPtr<FJsonValue>> JsonEvents;
            JsonEvents.Reserve(Summary.Events.Num());
            for (const FOmueBPEventInfo& E : Summary.Events)
            {
                TSharedPtr<FJsonObject> EObj = MakeShareable(new FJsonObject);
                EObj->SetStringField(TEXT("name"), E.Name);
                EObj->SetStringField(TEXT("eventType"), E.EventType);
                EObj->SetStringField(TEXT("graphId"), E.GraphId);
                EObj->SetNumberField(TEXT("nodeCount"),
                    static_cast<double>(E.NodeCount));
                JsonEvents.Add(MakeShareable(new FJsonValueObject(EObj)));
            }
            BPObj->SetArrayField(TEXT("events"), JsonEvents);
        }

        // ── macros[] ────────────────────────────────────────────
        {
            TArray<TSharedPtr<FJsonValue>> JsonMacros;
            JsonMacros.Reserve(Summary.Macros.Num());
            for (const FOmueBPMacroInfo& M : Summary.Macros)
            {
                TSharedPtr<FJsonObject> MObj = MakeShareable(new FJsonObject);
                MObj->SetStringField(TEXT("name"), M.Name);
                MObj->SetStringField(TEXT("graphId"), M.GraphId);
                MObj->SetNumberField(TEXT("nodeCount"),
                    static_cast<double>(M.NodeCount));
                JsonMacros.Add(MakeShareable(new FJsonValueObject(MObj)));
            }
            BPObj->SetArrayField(TEXT("macros"), JsonMacros);
        }

        DataObj->SetObjectField(TEXT("selectedBlueprint"), BPObj);
    }
    else
    {
        DataObj->SetField(TEXT("selectedBlueprint"),
            MakeShareable(new FJsonValueNull));
    }

    RootObj->SetObjectField(TEXT("data"), DataObj);
    RootObj->SetStringField(TEXT("timestamp"), FDateTime::UtcNow().ToIso8601());

    SendJsonResponse(RootObj, OnComplete, TEXT("HandleBlueprintGraphs"));
    return true;
}

// ═══════════════════════════════════════════════════════════════
// GET /context/blueprint-graph-detail handler (Phase K2b-2b)
//
// Returns single-graph node/pin/link detail for the first
// Content-Browser-selected Blueprint.
//
// Query param: ?graphId={kind}::{name}  (required)
//
// No selection or non-Blueprint → success:true, selectedBlueprint:null.
// Missing/invalid graphId → success:false, INVALID_PARAMETER.
// Valid graphId → success:true, nodes[] + pins[] + links[].
//
// No default value fields are exported.
// No asset modification.  No compilation triggered.
// ═══════════════════════════════════════════════════════════════

static bool HandleBlueprintGraphDetailRequest(
    const FHttpServerRequest& Request,
    const FHttpResultCallback& OnComplete)
{
    // ── 1. Parse graphId query param ──────────────────────────
    const FString* GraphIdPtr = Request.QueryParams.Find(TEXT("graphId"));
    if (GraphIdPtr == nullptr || GraphIdPtr->IsEmpty())
    {
        TSharedPtr<FJsonObject> RootObj = MakeShareable(new FJsonObject);
        RootObj->SetBoolField(TEXT("success"), false);

        TSharedPtr<FJsonObject> ErrorObj = MakeShareable(new FJsonObject);
        ErrorObj->SetStringField(TEXT("code"), TEXT("INVALID_PARAMETER"));
        ErrorObj->SetStringField(TEXT("message"),
            TEXT("Query parameter 'graphId' is required and must not be empty."));
        RootObj->SetObjectField(TEXT("error"), ErrorObj);
        RootObj->SetStringField(TEXT("timestamp"), FDateTime::UtcNow().ToIso8601());

        SendJsonResponse(RootObj, OnComplete, TEXT("HandleBlueprintGraphDetail-missing-graphId"));
        return true;
    }

    const FString GraphId = *GraphIdPtr;

    // ── 2. Collect detail ─────────────────────────────────────
    OmueBlueprintStructureReadCollector Collector;
    FOmueBPGraphDetailResult Detail;
    TArray<FString> AvailableGraphIds;

    if (Collector.TryGetGraphDetail(GraphId, Detail, &AvailableGraphIds))
    {
        // ── Success: build JSON response ──────────────────────
        TSharedPtr<FJsonObject> RootObj = MakeShareable(new FJsonObject);
        RootObj->SetBoolField(TEXT("success"), true);

        TSharedPtr<FJsonObject> DataObj = MakeShareable(new FJsonObject);
        TSharedPtr<FJsonObject> BPObj = MakeShareable(new FJsonObject);

        // exportMeta
        {
            TSharedPtr<FJsonObject> MetaObj = MakeShareable(new FJsonObject);
            MetaObj->SetStringField(TEXT("formatVersion"),
                Detail.ExportMeta.FormatVersion);
            MetaObj->SetStringField(TEXT("exportedAt"),
                Detail.ExportMeta.ExportedAt);
            MetaObj->SetStringField(TEXT("source"),
                Detail.ExportMeta.Source);
            MetaObj->SetStringField(TEXT("assetPath"),
                Detail.ExportMeta.AssetPath);

            TArray<TSharedPtr<FJsonValue>> JsonIncludedIds;
            for (const FString& Id : Detail.ExportMeta.IncludedGraphIds)
                JsonIncludedIds.Add(MakeShareable(new FJsonValueString(Id)));
            MetaObj->SetArrayField(TEXT("includedGraphIds"), JsonIncludedIds);

            BPObj->SetObjectField(TEXT("exportMeta"), MetaObj);
        }

        BPObj->SetStringField(TEXT("blueprintName"), Detail.BlueprintName);
        BPObj->SetStringField(TEXT("requestedGraphId"), Detail.RequestedGraphId);

        // graph (BlueprintGraphInfo + detail)
        {
            TSharedPtr<FJsonObject> GraphObj = MakeShareable(new FJsonObject);
            GraphObj->SetStringField(TEXT("graphId"), Detail.Graph.GraphId);
            GraphObj->SetStringField(TEXT("name"), Detail.Graph.Name);
            GraphObj->SetStringField(TEXT("kind"), Detail.Graph.Kind);
            GraphObj->SetNumberField(TEXT("nodeCount"),
                static_cast<double>(Detail.Graph.NodeCount));
            GraphObj->SetNumberField(TEXT("linkCount"),
                static_cast<double>(Detail.Graph.LinkCount));
            GraphObj->SetBoolField(TEXT("isEntryGraph"), Detail.Graph.bIsEntryGraph);

            // detail
            TSharedPtr<FJsonObject> DetailObj = MakeShareable(new FJsonObject);
            DetailObj->SetStringField(TEXT("graphId"), Detail.Detail.GraphId);

            // nodes[]
            {
                TArray<TSharedPtr<FJsonValue>> JsonNodes;
                JsonNodes.Reserve(Detail.Detail.Nodes.Num());
                for (const FOmueBPNodeInfo& N : Detail.Detail.Nodes)
                {
                    TSharedPtr<FJsonObject> NObj = MakeShareable(new FJsonObject);
                    NObj->SetStringField(TEXT("nodeId"), N.NodeId);
                    if (!N.NodeGuid.IsEmpty())
                        NObj->SetStringField(TEXT("nodeGuid"), N.NodeGuid);
                    NObj->SetStringField(TEXT("title"), N.Title);
                    NObj->SetStringField(TEXT("nodeType"), N.NodeType);

                    // pins[]
                    TArray<TSharedPtr<FJsonValue>> JsonPins;
                    JsonPins.Reserve(N.Pins.Num());
                    for (const FOmueBPPinInfo& P : N.Pins)
                    {
                        TSharedPtr<FJsonObject> PObj = MakeShareable(new FJsonObject);
                        PObj->SetStringField(TEXT("pinId"), P.PinId);
                        if (!P.PinGuid.IsEmpty())
                            PObj->SetStringField(TEXT("pinGuid"), P.PinGuid);
                        PObj->SetStringField(TEXT("name"), P.Name);
                        PObj->SetStringField(TEXT("direction"), P.Direction);
                        PObj->SetStringField(TEXT("pinKind"), P.PinKind);
                        PObj->SetStringField(TEXT("dataType"), P.DataType);
                        if (!P.PinCategory.IsEmpty())
                            PObj->SetStringField(TEXT("pinCategory"), P.PinCategory);
                        PObj->SetBoolField(TEXT("isArray"), P.bIsArray);
                        PObj->SetStringField(TEXT("containerType"), P.ContainerType);
                        PObj->SetBoolField(TEXT("isConnected"), P.bIsConnected);

                        // linkedTo[]
                        TArray<TSharedPtr<FJsonValue>> JsonLT;
                        JsonLT.Reserve(P.LinkedTo.Num());
                        for (const FString& LT : P.LinkedTo)
                            JsonLT.Add(MakeShareable(new FJsonValueString(LT)));
                        PObj->SetArrayField(TEXT("linkedTo"), JsonLT);

                        JsonPins.Add(MakeShareable(new FJsonValueObject(PObj)));
                    }
                    NObj->SetArrayField(TEXT("pins"), JsonPins);

                    NObj->SetBoolField(TEXT("isDisabled"), N.bIsDisabled);
                    NObj->SetStringField(TEXT("errorType"), N.ErrorType);
                    if (!N.ErrorMessage.IsEmpty())
                        NObj->SetStringField(TEXT("errorMessage"), N.ErrorMessage);

                    // ── Annotations: position ──
                    if (N.bHasPosition)
                    {
                        TSharedPtr<FJsonObject> PosObj = MakeShareable(new FJsonObject);
                        PosObj->SetNumberField(TEXT("x"), N.NodePosX);
                        PosObj->SetNumberField(TEXT("y"), N.NodePosY);
                        NObj->SetObjectField(TEXT("position"), PosObj);
                    }
                    // ── Annotations: comment ──
                    if (!N.NodeComment.IsEmpty())
                        NObj->SetStringField(TEXT("nodeComment"), N.NodeComment);
                    if (N.bCommentBubbleVisible)
                        NObj->SetBoolField(TEXT("commentBubbleVisible"), N.bCommentBubbleVisible);

                    JsonNodes.Add(MakeShareable(new FJsonValueObject(NObj)));
                }
                DetailObj->SetArrayField(TEXT("nodes"), JsonNodes);
            }

            // links[]
            {
                TArray<TSharedPtr<FJsonValue>> JsonLinks;
                JsonLinks.Reserve(Detail.Detail.Links.Num());
                for (const FOmueBPLinkInfo& L : Detail.Detail.Links)
                {
                    TSharedPtr<FJsonObject> LObj = MakeShareable(new FJsonObject);
                    LObj->SetStringField(TEXT("linkId"), L.LinkId);
                    LObj->SetStringField(TEXT("sourcePinId"), L.SourcePinId);
                    LObj->SetStringField(TEXT("sourceNodeId"), L.SourceNodeId);
                    LObj->SetStringField(TEXT("targetPinId"), L.TargetPinId);
                    LObj->SetStringField(TEXT("targetNodeId"), L.TargetNodeId);
                    JsonLinks.Add(MakeShareable(new FJsonValueObject(LObj)));
                }
                DetailObj->SetArrayField(TEXT("links"), JsonLinks);
            }

            // truncation (only if truncated)
            if (Detail.Detail.Truncation.bTruncated)
            {
                TSharedPtr<FJsonObject> TruncObj = MakeShareable(new FJsonObject);
                TruncObj->SetBoolField(TEXT("truncated"), true);
                TruncObj->SetStringField(TEXT("reason"),
                    Detail.Detail.Truncation.Reason);

                TArray<TSharedPtr<FJsonValue>> JsonWarnings;
                for (const FString& W : Detail.Detail.Truncation.Warnings)
                    JsonWarnings.Add(MakeShareable(new FJsonValueString(W)));
                TruncObj->SetArrayField(TEXT("warnings"), JsonWarnings);

                DetailObj->SetObjectField(TEXT("truncation"), TruncObj);
            }

            GraphObj->SetObjectField(TEXT("detail"), DetailObj);
            BPObj->SetObjectField(TEXT("graph"), GraphObj);
        }

        DataObj->SetObjectField(TEXT("selectedBlueprint"), BPObj);
        RootObj->SetObjectField(TEXT("data"), DataObj);
        RootObj->SetStringField(TEXT("timestamp"), FDateTime::UtcNow().ToIso8601());

        SendJsonResponse(RootObj, OnComplete, TEXT("HandleBlueprintGraphDetail"));
        return true;
    }

    if (AvailableGraphIds.Num() > 0)
    {
        // ── Blueprint found but graphId not in it ──────────────
        TSharedPtr<FJsonObject> RootObj = MakeShareable(new FJsonObject);
        RootObj->SetBoolField(TEXT("success"), false);

        TSharedPtr<FJsonObject> ErrorObj = MakeShareable(new FJsonObject);
        ErrorObj->SetStringField(TEXT("code"), TEXT("INVALID_PARAMETER"));

        // Build message with available graphIds
        FString AvailableStr = FString::Join(AvailableGraphIds, TEXT(", "));
        FString Msg = FString::Printf(
            TEXT("GraphId '%s' not found in the selected Blueprint. "
                 "Available graphIds: [%s]"),
            *GraphId, *AvailableStr);
        ErrorObj->SetStringField(TEXT("message"), Msg);

        RootObj->SetObjectField(TEXT("error"), ErrorObj);
        RootObj->SetStringField(TEXT("timestamp"), FDateTime::UtcNow().ToIso8601());

        SendJsonResponse(RootObj, OnComplete, TEXT("HandleBlueprintGraphDetail-invalid-graphId"));
        return true;
    }

    // ── No Blueprint selected ────────────────────────────────
    {
        TSharedPtr<FJsonObject> RootObj = MakeShareable(new FJsonObject);
        RootObj->SetBoolField(TEXT("success"), true);

        TSharedPtr<FJsonObject> DataObj = MakeShareable(new FJsonObject);
        DataObj->SetField(TEXT("selectedBlueprint"),
            MakeShareable(new FJsonValueNull));

        RootObj->SetObjectField(TEXT("data"), DataObj);
        RootObj->SetStringField(TEXT("timestamp"), FDateTime::UtcNow().ToIso8601());

        SendJsonResponse(RootObj, OnComplete, TEXT("HandleBlueprintGraphDetail-no-selection"));
        return true;
    }
}

// ═══════════════════════════════════════════════════════════════
// GET /context/behavior-tree-diagnostic handler (Phase E62)
//
// Returns read-only Behavior Tree hierarchy and Blackboard key
// definitions for a given asset path.
//
// Query param: ?assetPath=/Game/AI/BT_MonsterAI  (required)
//
// Uses OmueBehaviorTreeReadCollector singleton. If the collector
// is null or not initialized, returns SERVICE_UNAVAILABLE.
//
// Read-only: LoadObject() only, no asset modification.
// No PIE/world context. No AI controller.
// ═══════════════════════════════════════════════════════════════

static bool HandleBehaviorTreeDiagnosticRequest(
    const FHttpServerRequest& Request,
    const FHttpResultCallback& OnComplete)
{
    // ── 1. Check collector availability ───────────────────────
    if (!GBehaviorTreeReadCollector)
    {
        TSharedPtr<FJsonObject> RootObj = MakeShareable(new FJsonObject);
        RootObj->SetBoolField(TEXT("success"), false);

        TSharedPtr<FJsonObject> ErrorObj = MakeShareable(new FJsonObject);
        ErrorObj->SetStringField(TEXT("code"), TEXT("SERVICE_UNAVAILABLE"));
        ErrorObj->SetStringField(TEXT("message"),
            TEXT("BehaviorTreeReadCollector is not initialized."));
        RootObj->SetObjectField(TEXT("error"), ErrorObj);
        RootObj->SetStringField(TEXT("timestamp"), FDateTime::UtcNow().ToIso8601());

        FString Body;
        TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
        FJsonSerializer::Serialize(RootObj.ToSharedRef(), Writer);
        Writer->Close();

        auto Response = FHttpServerResponse::Create(Body, TEXT("application/json; charset=utf-8"));
        Response->Code = EHttpServerResponseCodes::ServiceUnavail;
        AddCorsHeaders(Response);
        OnComplete(MoveTemp(Response));
        return true;
    }

    // ── 2. Parse assetPath query param ────────────────────────
    const FString* AssetPathPtr = Request.QueryParams.Find(TEXT("assetPath"));
    if (AssetPathPtr == nullptr || AssetPathPtr->IsEmpty())
    {
        TSharedPtr<FJsonObject> RootObj = MakeShareable(new FJsonObject);
        RootObj->SetBoolField(TEXT("success"), false);

        TSharedPtr<FJsonObject> ErrorObj = MakeShareable(new FJsonObject);
        ErrorObj->SetStringField(TEXT("code"), TEXT("INVALID_PARAMETER"));
        ErrorObj->SetStringField(TEXT("message"),
            TEXT("Query parameter 'assetPath' is required and must not be empty. "
                 "Example: ?assetPath=/Game/AI/BT_MonsterAI"));
        RootObj->SetObjectField(TEXT("error"), ErrorObj);
        RootObj->SetStringField(TEXT("timestamp"), FDateTime::UtcNow().ToIso8601());

        FString Body;
        TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
        FJsonSerializer::Serialize(RootObj.ToSharedRef(), Writer);
        Writer->Close();

        auto Response = FHttpServerResponse::Create(Body, TEXT("application/json; charset=utf-8"));
        Response->Code = EHttpServerResponseCodes::BadRequest;
        AddCorsHeaders(Response);
        OnComplete(MoveTemp(Response));
        return true;
    }

    const FString& AssetPath = *AssetPathPtr;

    // ── 3. Collect diagnostic ─────────────────────────────────
    FString OutJson;
    FString OutError;
    if (!GBehaviorTreeReadCollector->TryCollect(AssetPath, OutJson, OutError))
    {
        // Asset not found or load failure
        TSharedPtr<FJsonObject> RootObj = MakeShareable(new FJsonObject);
        RootObj->SetBoolField(TEXT("success"), false);

        TSharedPtr<FJsonObject> ErrorObj = MakeShareable(new FJsonObject);
        ErrorObj->SetStringField(TEXT("code"), TEXT("ASSET_NOT_FOUND"));
        ErrorObj->SetStringField(TEXT("message"), OutError);
        RootObj->SetObjectField(TEXT("error"), ErrorObj);
        RootObj->SetStringField(TEXT("timestamp"), FDateTime::UtcNow().ToIso8601());

        FString Body;
        TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
        FJsonSerializer::Serialize(RootObj.ToSharedRef(), Writer);
        Writer->Close();

        auto Response = FHttpServerResponse::Create(Body, TEXT("application/json; charset=utf-8"));
        Response->Code = EHttpServerResponseCodes::NotFound;
        AddCorsHeaders(Response);
        OnComplete(MoveTemp(Response));
        return true;
    }

    // ── 4. Success response ───────────────────────────────────
    auto Response = FHttpServerResponse::Create(OutJson, TEXT("application/json; charset=utf-8"));
    Response->Code = EHttpServerResponseCodes::Ok;
    AddCorsHeaders(Response);
    OnComplete(MoveTemp(Response));
    return true;
}

// ═══════════════════════════════════════════════════════════════
// GET /capabilities handler (E70)
//
// Read-only capability discovery endpoint. Returns per-operation-kind
// capability metadata, preflight check availability summary, and
// bridge/plugin version information.
//
// Read-only: no asset modification, no compilation, no PIE trigger.
// All write/compile/PIE/Automation/AI capabilities report as
// not_implemented or pending_user_local_validation.
//
// Response shape aligns with shared-protocol BridgeCapabilityDiscovery.
// ═══════════════════════════════════════════════════════════════

static bool HandleCapabilitiesRequest(
    const FHttpServerRequest& Request,
    const FHttpResultCallback& OnComplete)
{
    TSharedPtr<FJsonObject> RootObj = MakeShareable(new FJsonObject);
    RootObj->SetBoolField(TEXT("success"), true);

    TSharedPtr<FJsonObject> DataObj = MakeShareable(new FJsonObject);
    DataObj->SetStringField(TEXT("bridgeVersion"), BridgeVersion);
    DataObj->SetStringField(TEXT("editorStatus"), TEXT("unknown"));

    // ── capabilities[] ───────────────────────────────────────────
    TArray<TSharedPtr<FJsonValue>> CapabilitiesArray;

    // Blueprint edit — supported at the data-shape level, preflight
    // is available. Actual write execution is deferred to E71+.
    {
        TSharedPtr<FJsonObject> Cap = MakeShareable(new FJsonObject);
        Cap->SetStringField(TEXT("operationKind"), TEXT("blueprint_edit"));
        Cap->SetStringField(TEXT("status"), TEXT("pending_user_local_validation"));
        Cap->SetStringField(TEXT("description"),
            TEXT("Blueprint variable/property edit support — data shape ready, "
                 "requires UE header verification and user-local validation before write."));
        Cap->SetBoolField(TEXT("preflightAvailable"), true);

        TArray<TSharedPtr<FJsonValue>> PreflightChecks;
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("bridge_availability"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("asset_path_validity"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("asset_type_supported"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("package_writable"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("dirty_state"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("context_mismatch"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("bridge_version"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("approval_gate_status"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("snapshot_availability"))));
        Cap->SetArrayField(TEXT("applicablePreflightChecks"), PreflightChecks);

        CapabilitiesArray.Add(MakeShareable(new FJsonValueObject(Cap)));
    }

    // Behavior Tree edit — data shape defined, endpoint not implemented.
    {
        TSharedPtr<FJsonObject> Cap = MakeShareable(new FJsonObject);
        Cap->SetStringField(TEXT("operationKind"), TEXT("scratch_duplicate"));
        Cap->SetStringField(TEXT("status"), TEXT("pending_user_local_validation"));
        Cap->SetStringField(TEXT("description"),
            TEXT("Create a dirty, unsaved scratch duplicate of a Blueprint for sandbox repair flow."));
        Cap->SetBoolField(TEXT("preflightAvailable"), true);

        TArray<TSharedPtr<FJsonValue>> PreflightChecks;
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("source_asset_exists"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("target_scratch_allowlisted"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("approval_metadata_present"))));
        Cap->SetArrayField(TEXT("applicablePreflightChecks"), PreflightChecks);

        CapabilitiesArray.Add(MakeShareable(new FJsonValueObject(Cap)));
    }

    {
        TSharedPtr<FJsonObject> Cap = MakeShareable(new FJsonObject);
        Cap->SetStringField(TEXT("operationKind"), TEXT("scratch_compile"));
        Cap->SetStringField(TEXT("status"), TEXT("pending_user_local_validation"));
        Cap->SetStringField(TEXT("description"),
            TEXT("Compile an allowlisted scratch Blueprint without saving, PIE, or Automation."));
        Cap->SetBoolField(TEXT("preflightAvailable"), true);

        TArray<TSharedPtr<FJsonValue>> PreflightChecks;
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("asset_compilable"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("target_scratch_allowlisted"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("approval_metadata_present"))));
        Cap->SetArrayField(TEXT("applicablePreflightChecks"), PreflightChecks);

        CapabilitiesArray.Add(MakeShareable(new FJsonValueObject(Cap)));
    }

    {
        TSharedPtr<FJsonObject> Cap = MakeShareable(new FJsonObject);
        Cap->SetStringField(TEXT("operationKind"), TEXT("scratch_sandbox_apply"));
        Cap->SetStringField(TEXT("status"), TEXT("pending_user_local_validation"));
        Cap->SetStringField(TEXT("description"),
            TEXT("Apply a typed fix payload to a sandbox scratch Blueprint copy "
                 "(path must end with _Sandbox). Reuses typed-payload validation and the existing "
                 "write logic. Does not save, compile, or trigger PIE."));
        Cap->SetBoolField(TEXT("preflightAvailable"), true);

        TArray<TSharedPtr<FJsonValue>> PreflightChecks;
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("target_scratch_allowlisted"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("target_sandbox_suffix"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("typed_payload_valid"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("approval_metadata_present"))));
        Cap->SetArrayField(TEXT("applicablePreflightChecks"), PreflightChecks);

        CapabilitiesArray.Add(MakeShareable(new FJsonValueObject(Cap)));
    }

    // Behavior Tree edit - data shape defined, endpoint not implemented.
    {
        TSharedPtr<FJsonObject> Cap = MakeShareable(new FJsonObject);
        Cap->SetStringField(TEXT("operationKind"), TEXT("behavior_tree"));
        Cap->SetStringField(TEXT("status"), TEXT("not_implemented"));
        Cap->SetStringField(TEXT("description"),
            TEXT("Behavior Tree node/selector/task edit — deferred. "
                 "Requires separate design and asset-specific preflight."));
        Cap->SetBoolField(TEXT("preflightAvailable"), false);

        TArray<TSharedPtr<FJsonValue>> PreflightChecks;
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("bridge_availability"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("asset_path_validity"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("bridge_version"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("approval_gate_status"))));
        Cap->SetArrayField(TEXT("applicablePreflightChecks"), PreflightChecks);

        CapabilitiesArray.Add(MakeShareable(new FJsonValueObject(Cap)));
    }

    // Blackboard key edit — data shape defined, endpoint not implemented.
    {
        TSharedPtr<FJsonObject> Cap = MakeShareable(new FJsonObject);
        Cap->SetStringField(TEXT("operationKind"), TEXT("blackboard"));
        Cap->SetStringField(TEXT("status"), TEXT("not_implemented"));
        Cap->SetStringField(TEXT("description"),
            TEXT("Blackboard key add/edit/remove — deferred. "
                 "Requires separate design and asset-specific preflight."));
        Cap->SetBoolField(TEXT("preflightAvailable"), false);

        TArray<TSharedPtr<FJsonValue>> PreflightChecks;
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("bridge_availability"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("asset_path_validity"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("bridge_version"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("approval_gate_status"))));
        Cap->SetArrayField(TEXT("applicablePreflightChecks"), PreflightChecks);

        CapabilitiesArray.Add(MakeShareable(new FJsonValueObject(Cap)));
    }

    // Manual step — no UE bridge operation needed.
    {
        TSharedPtr<FJsonObject> Cap = MakeShareable(new FJsonObject);
        Cap->SetStringField(TEXT("operationKind"), TEXT("manual"));
        Cap->SetStringField(TEXT("status"), TEXT("supported"));
        Cap->SetStringField(TEXT("description"),
            TEXT("Manual/user-performed steps — no UE bridge operation required. "
                 "Listed as a supported operation kind for completeness."));
        Cap->SetBoolField(TEXT("preflightAvailable"), false);

        TArray<TSharedPtr<FJsonValue>> PreflightChecks;
        Cap->SetArrayField(TEXT("applicablePreflightChecks"), PreflightChecks);

        CapabilitiesArray.Add(MakeShareable(new FJsonValueObject(Cap)));
    }

    // Generic asset write — deferred, requires full design cycle.
    {
        TSharedPtr<FJsonObject> Cap = MakeShareable(new FJsonObject);
        Cap->SetStringField(TEXT("operationKind"), TEXT("asset_write"));
        Cap->SetStringField(TEXT("status"), TEXT("not_implemented"));
        Cap->SetStringField(TEXT("description"),
            TEXT("Generic UE asset write (non-Blueprint, non-BT, non-BB) — deferred. "
                 "Requires separate design and safety review."));
        Cap->SetBoolField(TEXT("preflightAvailable"), false);

        TArray<TSharedPtr<FJsonValue>> PreflightChecks;
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("bridge_availability"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("asset_path_validity"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("asset_type_supported"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("bridge_version"))));
        PreflightChecks.Add(MakeShareable(new FJsonValueString(TEXT("approval_gate_status"))));
        Cap->SetArrayField(TEXT("applicablePreflightChecks"), PreflightChecks);

        CapabilitiesArray.Add(MakeShareable(new FJsonValueObject(Cap)));
    }

    DataObj->SetArrayField(TEXT("capabilities"), CapabilitiesArray);

    // ── preflightSummary ──────────────────────────────────────────
    TSharedPtr<FJsonObject> PreflightSummaryObj = MakeShareable(new FJsonObject);

    // Available checks (can theoretically run or are defined as data shapes)
    {
        TArray<TSharedPtr<FJsonValue>> Available;
        Available.Add(MakeShareable(new FJsonValueString(TEXT("bridge_availability"))));
        Available.Add(MakeShareable(new FJsonValueString(TEXT("bridge_version"))));
        Available.Add(MakeShareable(new FJsonValueString(TEXT("approval_gate_status"))));
        Available.Add(MakeShareable(new FJsonValueString(TEXT("source_asset_exists"))));
        Available.Add(MakeShareable(new FJsonValueString(TEXT("target_scratch_allowlisted"))));
        Available.Add(MakeShareable(new FJsonValueString(TEXT("target_sandbox_suffix"))));
        Available.Add(MakeShareable(new FJsonValueString(TEXT("typed_payload_valid"))));
        Available.Add(MakeShareable(new FJsonValueString(TEXT("asset_compilable"))));
        Available.Add(MakeShareable(new FJsonValueString(TEXT("approval_metadata_present"))));
        PreflightSummaryObj->SetArrayField(TEXT("availableChecks"), Available);
    }

    // Not yet implemented checks
    {
        TArray<TSharedPtr<FJsonValue>> NotImplemented;
        NotImplemented.Add(MakeShareable(new FJsonValueString(TEXT("asset_path_validity"))));
        NotImplemented.Add(MakeShareable(new FJsonValueString(TEXT("asset_type_supported"))));
        NotImplemented.Add(MakeShareable(new FJsonValueString(TEXT("package_writable"))));
        NotImplemented.Add(MakeShareable(new FJsonValueString(TEXT("dirty_state"))));
        NotImplemented.Add(MakeShareable(new FJsonValueString(TEXT("context_mismatch"))));
        NotImplemented.Add(MakeShareable(new FJsonValueString(TEXT("snapshot_availability"))));
        PreflightSummaryObj->SetArrayField(TEXT("notImplementedChecks"), NotImplemented);
    }

    // Checks requiring user-local validation
    {
        TArray<TSharedPtr<FJsonValue>> PendingUser;
        PreflightSummaryObj->SetArrayField(TEXT("pendingUserValidationChecks"), PendingUser);
    }

    DataObj->SetObjectField(TEXT("preflightSummary"), PreflightSummaryObj);

    DataObj->SetStringField(TEXT("timestamp"), FDateTime::UtcNow().ToIso8601());

    RootObj->SetObjectField(TEXT("data"), DataObj);
    RootObj->SetStringField(TEXT("timestamp"), FDateTime::UtcNow().ToIso8601());

    SendJsonResponse(RootObj, OnComplete, TEXT("HandleCapabilities"));
    return true;
}

// ═══════════════════════════════════════════════════════════════
// POST /write/scratch + POST /write/scratch/rollback (E71)
//
// Minimal reversible UE write endpoint with full safety gates:
//   - Allowlisted scratch/test target path only
//   - Approval metadata required
//   - Preflight readiness check (refuses if not ready)
//   - Snapshot readiness check (refuses if snapshot unavailable)
//
// Reversible-write safety model:
//   - Does NOT perform actual UE asset writes during automation.
//   - Accepted write/rollback operations return requiresUserLocalValidation=true.
//   - Refused requests return structured reasons and do not require local asset validation.
//   - User must compile, curl-test, and verify accepted UE Editor changes locally.
//
// Request body (JSON):
// {
//   "targetAssetPath": "/Game/Scratch/...",
//   "description": "What this write does",
//   "operationKind": "blueprint_edit",
//   "approval": { "approvalId": "...", "approvedAt": "..." },
//   "requireSnapshot": true
// }
// ═══════════════════════════════════════════════════════════════

static bool HandleWriteScratchRequest(
    const FHttpServerRequest& Request,
    const FHttpResultCallback& OnComplete);

static bool HandleWriteScratchSandboxApplyRequest(
    const FHttpServerRequest& Request,
    const FHttpResultCallback& OnComplete);

static bool HandleWriteScratchRollbackRequest(
    const FHttpServerRequest& Request,
    const FHttpResultCallback& OnComplete);

/** Parse request body (TArray<uint8>) into a FJsonObject. Returns nullptr on failure. */
static TSharedPtr<FJsonObject> ParseRequestBody(const FHttpServerRequest& Request)
{
    FString BodyString;
    {
        FUTF8ToTCHAR Converter(
            reinterpret_cast<const ANSICHAR*>(Request.Body.GetData()),
            Request.Body.Num());
        BodyString = FString(Converter.Length(), Converter.Get());
    }
    if (BodyString.IsEmpty()) return nullptr;

    TSharedPtr<FJsonObject> Obj;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(BodyString);
    if (!FJsonSerializer::Deserialize(Reader, Obj) || !Obj.IsValid()) return nullptr;
    return Obj;
}

/**
 * Build a single E71/E84 WritePreflightCheckResult JsonValue.
 * E84 typed-payload preflight uses this helper so the response can
 * include multiple check rows instead of a single row.
 */
static TSharedPtr<FJsonValue> MakeWriteCheckValue(
    const FString& CheckId,
    const FString& CheckName,
    bool bPassed,
    const FString& Message)
{
    TSharedPtr<FJsonObject> CheckObj = MakeShareable(new FJsonObject);
    CheckObj->SetStringField(TEXT("checkId"), CheckId);
    CheckObj->SetStringField(TEXT("checkName"), CheckName);
    CheckObj->SetBoolField(TEXT("passed"), bPassed);
    CheckObj->SetStringField(TEXT("message"), Message);
    return MakeShareable(new FJsonValueObject(CheckObj));
}

/**
 * Build a single refusal check row using the refusal reason as the
 * check ID. Preserves the E71 single-row shape for the pre-E84
 * refusal paths so the response envelope stays backwards-compatible.
 */
static TSharedPtr<FJsonValue> MakeLegacyRefusalCheckValue(
    const TCHAR* RefusalReason,
    bool bPassed,
    const FString& Message)
{
    const FString CheckId = RefusalReason != nullptr
        ? FString(RefusalReason)
        : FString(TEXT("preflight_failed"));
    return MakeWriteCheckValue(CheckId, TEXT("Write Request Preflight"), bPassed, Message);
}

/**
 * Build and send a standard E71 success/refusal JSON response and send it.
 *
 * E84: accepts a `Checks` array so the refusal paths can report the
 * full E84 typed-payload preflight sequence. Pre-E84 callers that
 * only have a single refusal reason can pass a one-element array
 * built from `MakeLegacyRefusalCheckValue`.
 */
static void SendWriteResponse(
    bool Success,
    const FString& GateState,
    const FString& Message,
    bool RequiresLocal,
    bool PreflightPassed,
    const TCHAR* RefusalReason,
    const TCHAR* ErrorCode,
    const TArray<TSharedPtr<FJsonValue>>& Checks,
    const FHttpResultCallback& OnComplete)
{
    TSharedPtr<FJsonObject> RootObj = MakeShareable(new FJsonObject);
    // HTTP/API envelope success means the bridge handled the request and is
    // returning a structured write result. The business result is data.success.
    RootObj->SetBoolField(TEXT("success"), true);
    RootObj->SetStringField(TEXT("timestamp"), FDateTime::UtcNow().ToIso8601());

    TSharedPtr<FJsonObject> DataObj = MakeShareable(new FJsonObject);
    DataObj->SetBoolField(TEXT("success"), Success);
    DataObj->SetStringField(TEXT("message"), Message);
    DataObj->SetStringField(TEXT("gateState"), GateState);
    DataObj->SetBoolField(TEXT("requiresUserLocalValidation"), RequiresLocal);

    // ── preflight ───────────────────────────────────────────
    TSharedPtr<FJsonObject> PreflightObj = MakeShareable(new FJsonObject);
    PreflightObj->SetBoolField(TEXT("passed"), PreflightPassed);
    PreflightObj->SetArrayField(TEXT("checks"), Checks);
    DataObj->SetObjectField(TEXT("preflight"), PreflightObj);

    // ── snapshot (not-implemented during automation) ──
    TSharedPtr<FJsonObject> SnapshotObj = MakeShareable(new FJsonObject);
    SnapshotObj->SetBoolField(TEXT("created"), false);
    SnapshotObj->SetStringField(TEXT("refusalReason"), TEXT("snapshot_unavailable"));
    SnapshotObj->SetStringField(TEXT("message"), RequiresLocal
        ? TEXT("Snapshot creation is not implemented during automation. User-local UE compile verification required.")
        : TEXT("Snapshot was not created because the write request was refused before any asset mutation."));
    DataObj->SetObjectField(TEXT("snapshot"), SnapshotObj);

    // ── rollback (not-verified during automation) ────
    TSharedPtr<FJsonObject> RollbackObj = MakeShareable(new FJsonObject);
    RollbackObj->SetBoolField(TEXT("attempted"), false);
    RollbackObj->SetStringField(TEXT("refusalReason"), TEXT("rollback_not_verified"));
    RollbackObj->SetStringField(TEXT("message"), RequiresLocal
        ? TEXT("Rollback requires user-local verification. The endpoint structure and protocol types are ready, but actual rollback execution must be validated in UE Editor.")
        : TEXT("Rollback was not attempted because no asset mutation was performed."));
    DataObj->SetObjectField(TEXT("rollback"), RollbackObj);

    if (RefusalReason != nullptr)
        DataObj->SetStringField(TEXT("refusalReason"), RefusalReason);
    if (ErrorCode != nullptr)
        DataObj->SetStringField(TEXT("errorCode"), ErrorCode);

    RootObj->SetObjectField(TEXT("data"), DataObj);
    SendJsonResponse(RootObj, OnComplete, TEXT("HandleWriteScratch"));
}

/**
 * Build and send a standard rollback response.
 */
static void SendRollbackResponse(
    bool Success,
    const FString& GateState,
    bool RequiresLocal,
    const FString& Message,
    const TCHAR* RefusalReason,
    const TCHAR* RollbackRefusalReason,
    const FString& RollbackMessage,
    const FHttpResultCallback& OnComplete,
    const TCHAR* ErrorContext)
{
    TSharedPtr<FJsonObject> RootObj = MakeShareable(new FJsonObject);
    RootObj->SetBoolField(TEXT("success"), true);
    RootObj->SetStringField(TEXT("timestamp"), FDateTime::UtcNow().ToIso8601());

    TSharedPtr<FJsonObject> DataObj = MakeShareable(new FJsonObject);
    DataObj->SetBoolField(TEXT("success"), Success);
    DataObj->SetStringField(TEXT("gateState"), GateState);
    DataObj->SetBoolField(TEXT("requiresUserLocalValidation"), RequiresLocal);
    DataObj->SetStringField(TEXT("message"), Message);
    if (RefusalReason != nullptr)
        DataObj->SetStringField(TEXT("refusalReason"), RefusalReason);

    TSharedPtr<FJsonObject> RollbackObj = MakeShareable(new FJsonObject);
    RollbackObj->SetBoolField(TEXT("attempted"), false);
    if (RollbackRefusalReason != nullptr)
        RollbackObj->SetStringField(TEXT("refusalReason"), RollbackRefusalReason);
    RollbackObj->SetStringField(TEXT("message"), RollbackMessage);
    DataObj->SetObjectField(TEXT("rollback"), RollbackObj);

    RootObj->SetObjectField(TEXT("data"), DataObj);
    SendJsonResponse(RootObj, OnComplete, ErrorContext);
}

/**
 * Parse a JSON field from a shared-ref TSharedPtr<FJsonObject>.
 */
static bool GetJsonStringField(
    const TSharedPtr<FJsonObject>& Obj,
    const FString& FieldName,
    FString& OutValue)
{
    if (!Obj.IsValid()) return false;
    return Obj->TryGetStringField(FieldName, OutValue);
}

/** Allowlisted path prefixes for scratch/test writes. */
static const TArray<FString> ALLOWED_SCRATCH_PREFIXES = {
    TEXT("/Game/Scratch/"),
    TEXT("/Game/Test/"),
};

static bool IsPathAllowlisted(const FString& InPath)
{
    for (const FString& Prefix : ALLOWED_SCRATCH_PREFIXES)
    {
        if (InPath.StartsWith(Prefix)) return true;
    }
    return false;
}

static FString ToBlueprintObjectPath(const FString& AssetPath)
{
    FString Trimmed = AssetPath;
    Trimmed.TrimStartAndEndInline();
    if (Trimmed.Contains(TEXT(".")))
    {
        return Trimmed;
    }

    FString PackagePath;
    FString AssetName;
    if (Trimmed.Split(TEXT("/"), &PackagePath, &AssetName, ESearchCase::CaseSensitive, ESearchDir::FromEnd)
        && !PackagePath.IsEmpty()
        && !AssetName.IsEmpty())
    {
        return FString::Printf(TEXT("%s/%s.%s"), *PackagePath, *AssetName, *AssetName);
    }

    return Trimmed;
}

static bool DoesBlueprintAssetExist(const FString& AssetPath)
{
    const FString ObjectPath = ToBlueprintObjectPath(AssetPath);
    UObject* LoadedObject = StaticLoadObject(UBlueprint::StaticClass(), nullptr, *ObjectPath);
    return Cast<UBlueprint>(LoadedObject) != nullptr;
}

static UBlueprint* LoadBlueprintAsset(const FString& AssetPath)
{
    const FString ObjectPath = ToBlueprintObjectPath(AssetPath);
    UObject* LoadedObject = StaticLoadObject(UBlueprint::StaticClass(), nullptr, *ObjectPath);
    return Cast<UBlueprint>(LoadedObject);
}

static bool IsScratchCompilePathAllowlisted(const FString& InPath)
{
    return InPath.StartsWith(TEXT("/Game/Scratch/"));
}

static bool TrySplitLongAssetPath(
    const FString& AssetPath,
    FString& OutPackagePath,
    FString& OutAssetName)
{
    FString Trimmed = AssetPath;
    Trimmed.TrimStartAndEndInline();
    if (Trimmed.IsEmpty() || Trimmed.Contains(TEXT(".")))
    {
        return false;
    }

    FString ParentPath;
    FString AssetName;
    if (!Trimmed.Split(TEXT("/"), &ParentPath, &AssetName, ESearchCase::CaseSensitive, ESearchDir::FromEnd)
        || ParentPath.IsEmpty()
        || AssetName.IsEmpty())
    {
        return false;
    }

    OutPackagePath = Trimmed;
    OutAssetName = AssetName;
    return true;
}

static bool HasApprovalMetadata(const TSharedPtr<FJsonObject>& RequestObj, FString& OutApprovalId, FString& OutApprovedAt)
{
    OutApprovalId.Reset();
    OutApprovedAt.Reset();

    const TSharedPtr<FJsonObject>* ApprovalObj = nullptr;
    if (RequestObj.IsValid()
        && RequestObj->TryGetObjectField(TEXT("approval"), ApprovalObj)
        && ApprovalObj != nullptr
        && ApprovalObj->IsValid())
    {
        GetJsonStringField(*ApprovalObj, TEXT("approvalId"), OutApprovalId);
        GetJsonStringField(*ApprovalObj, TEXT("approvedAt"), OutApprovedAt);
    }

    return !OutApprovalId.IsEmpty() && !OutApprovedAt.IsEmpty();
}

static void SendDuplicateResponse(
    bool Success,
    const FString& ScratchAssetPath,
    const FString& SnapshotId,
    const FString& Message,
    const TCHAR* RefusalReason,
    const FHttpResultCallback& OnComplete)
{
    TSharedPtr<FJsonObject> RootObj = MakeShareable(new FJsonObject);
    RootObj->SetBoolField(TEXT("success"), true);
    RootObj->SetStringField(TEXT("timestamp"), FDateTime::UtcNow().ToIso8601());

    TSharedPtr<FJsonObject> DataObj = MakeShareable(new FJsonObject);
    DataObj->SetBoolField(TEXT("success"), Success);
    DataObj->SetStringField(TEXT("scratchAssetPath"), ScratchAssetPath);
    if (!SnapshotId.IsEmpty())
    {
        DataObj->SetStringField(TEXT("snapshotId"), SnapshotId);
    }
    DataObj->SetStringField(TEXT("message"), Message);
    if (RefusalReason != nullptr)
    {
        DataObj->SetStringField(TEXT("refusalReason"), RefusalReason);
    }

    RootObj->SetObjectField(TEXT("data"), DataObj);
    SendJsonResponse(RootObj, OnComplete, TEXT("HandleWriteScratchDuplicate"));
}

static TSharedPtr<FJsonValue> MakeCompileIssueValue(
    const FString& Code,
    const FString& Message,
    const FString& Severity)
{
    TSharedPtr<FJsonObject> IssueObj = MakeShareable(new FJsonObject);
    IssueObj->SetStringField(TEXT("code"), Code);
    IssueObj->SetStringField(TEXT("message"), Message);
    IssueObj->SetStringField(TEXT("severity"), Severity);
    return MakeShareable(new FJsonValueObject(IssueObj));
}

static TArray<TSharedPtr<FJsonValue>> CollectBlueprintCompileIssues(UBlueprint* Blueprint, bool& bHasErrors)
{
    TArray<TSharedPtr<FJsonValue>> Issues;
    bHasErrors = false;
    if (!Blueprint)
    {
        return Issues;
    }

    TSharedRef<IMessageLogListing> Listing =
        FCompilerResultsLog::GetBlueprintMessageLog(Blueprint);
    const TArray<TSharedRef<FTokenizedMessage>>& Messages =
        Listing->GetFilteredMessages();

    static constexpr int32 MaxIssues = 20;
    for (const TSharedRef<FTokenizedMessage>& Msg : Messages)
    {
        const EMessageSeverity::Type Severity = Msg->GetSeverity();
        const bool bIsError = Severity == EMessageSeverity::Error;
        const bool bIsWarning = Severity == EMessageSeverity::Warning
            || Severity == EMessageSeverity::PerformanceWarning;

        if (!bIsError && !bIsWarning)
        {
            continue;
        }

        bHasErrors = bHasErrors || bIsError;
        if (Issues.Num() >= MaxIssues)
        {
            continue;
        }

        Issues.Add(MakeCompileIssueValue(
            TEXT(""),
            Msg->ToText().ToString(),
            bIsError ? TEXT("error") : TEXT("warning")));
    }

    return Issues;
}

static void SendCompileResponse(
    bool Success,
    const TArray<TSharedPtr<FJsonValue>>& Errors,
    double DurationMs,
    const FString& Message,
    const TCHAR* RefusalReason,
    const FHttpResultCallback& OnComplete)
{
    TSharedPtr<FJsonObject> RootObj = MakeShareable(new FJsonObject);
    RootObj->SetBoolField(TEXT("success"), true);
    RootObj->SetStringField(TEXT("timestamp"), FDateTime::UtcNow().ToIso8601());

    TSharedPtr<FJsonObject> DataObj = MakeShareable(new FJsonObject);
    DataObj->SetBoolField(TEXT("success"), Success);
    DataObj->SetArrayField(TEXT("errors"), Errors);
    DataObj->SetNumberField(TEXT("durationMs"), DurationMs);
    DataObj->SetStringField(TEXT("message"), Message);
    if (RefusalReason != nullptr)
    {
        DataObj->SetStringField(TEXT("refusalReason"), RefusalReason);
    }

    RootObj->SetObjectField(TEXT("data"), DataObj);
    SendJsonResponse(RootObj, OnComplete, TEXT("HandleCompileBlueprint"));
}

// ═══════════════════════════════════════════════════════════════
// E84 typed-payload preflight constants and validator
// ═══════════════════════════════════════════════════════════════
//
// E84 extends the existing POST /write/scratch endpoint with a
// read-only preflight that validates the E83 typed fix payload
// before refusing execution as `write_not_implemented`. The
// validator mirrors the Desktop mock (`mock-bridge-client.ts`)
// at the level of check IDs and refusal reasons.
//
// Safety: this function is pure data validation. It does not
// modify, save, or generate any UE/Blueprint asset. The
// `description` field is NEVER inspected to decide mutation
// semantics — only the structured `typedPayload` is.

/** E83/E84 typed-payload schema version. Must match the
 *  shared-protocol `SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION`. */
static const TCHAR* SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION =
    TEXT("omue.safeScratchBlueprintMutation.v1");

/** E83 single supported operation kind. */
static const TCHAR* SAFE_SCRATCH_BLUEPRINT_MUTATION_OPERATION_KIND =
    TEXT("set_blueprint_metadata_marker");
static const TCHAR* SAFE_SCRATCH_BLUEPRINT_MUTATION_VARIABLE_DEFAULT_OPERATION_KIND =
    TEXT("set_blueprint_variable_default");

/** E83 single supported target asset kind. */
static const TCHAR* SAFE_SCRATCH_BLUEPRINT_MUTATION_TARGET_KIND =
    TEXT("blueprint_scratch_fixture");

/** E84 single supported before-state kind. */
static const TCHAR* SAFE_SCRATCH_BLUEPRINT_MUTATION_BEFORE_STATE_KIND =
    TEXT("missing_or_absent_allowed");
static const TCHAR* SAFE_SCRATCH_BLUEPRINT_MUTATION_METADATA_AFTER_STATE_KIND =
    TEXT("metadata_key_value");
static const TCHAR* SAFE_SCRATCH_BLUEPRINT_MUTATION_VARIABLE_AFTER_STATE_KIND =
    TEXT("variable_default");

static bool IsSupportedTypedPayloadOperationKind(const FString& OperationKind)
{
    return OperationKind == SAFE_SCRATCH_BLUEPRINT_MUTATION_OPERATION_KIND
        || OperationKind == SAFE_SCRATCH_BLUEPRINT_MUTATION_VARIABLE_DEFAULT_OPERATION_KIND;
}

static bool IsVariableDefaultValueCompatible(
    const FBPVariableDescription& VarDesc,
    const FString& DefaultValue,
    FString& OutReason)
{
    const FString PinCategory = VarDesc.VarType.PinCategory.ToString();

    if (PinCategory == TEXT("int") || PinCategory == TEXT("int64") || PinCategory == TEXT("byte"))
    {
        if (!FDefaultValueHelper::IsStringValidInteger(DefaultValue))
        {
            OutReason = FString::Printf(TEXT("Variable '%s' expects an integer-compatible default value."),
                *VarDesc.VarName.ToString());
            return false;
        }
    }
    else if (PinCategory == TEXT("float") || PinCategory == TEXT("double") || PinCategory == TEXT("real"))
    {
        if (!FDefaultValueHelper::IsStringValidFloat(DefaultValue))
        {
            OutReason = FString::Printf(TEXT("Variable '%s' expects a float-compatible default value."),
                *VarDesc.VarName.ToString());
            return false;
        }
    }
    else if (PinCategory == TEXT("bool"))
    {
        const bool bIsBoolLike = DefaultValue.Equals(TEXT("true"), ESearchCase::IgnoreCase)
            || DefaultValue.Equals(TEXT("false"), ESearchCase::IgnoreCase)
            || DefaultValue == TEXT("0")
            || DefaultValue == TEXT("1");
        if (!bIsBoolLike)
        {
            OutReason = FString::Printf(TEXT("Variable '%s' expects a bool-compatible default value."),
                *VarDesc.VarName.ToString());
            return false;
        }
    }

    OutReason = TEXT("Variable default value is compatible with the variable type.");
    return true;
}

/**
 * Result of E84 typed-payload validation. `bPassed` is true when
 * every check row passed; `RefusalReason` is non-null on failure
 * and matches a `WriteRefusalReason` value.
 */
struct FOmueTypedPayloadValidationResult
{
    bool bPassed = false;
    TArray<TSharedPtr<FJsonValue>> Checks;
    const TCHAR* RefusalReason = nullptr;
    FString Message;
};

/** Try to read a string field from a JSON object. */
static bool ReadJsonStringField(
    const TSharedPtr<FJsonObject>& Obj,
    const FString& FieldName,
    FString& OutValue)
{
    if (!Obj.IsValid()) return false;
    return Obj->TryGetStringField(FieldName, OutValue);
}

/** Try to read a bool field from a JSON object. */
static bool ReadJsonBoolField(
    const TSharedPtr<FJsonObject>& Obj,
    const FString& FieldName,
    bool& OutValue)
{
    if (!Obj.IsValid()) return false;
    return Obj->TryGetBoolField(FieldName, OutValue);
}

/** Try to read an object field from a JSON object. */
static bool ReadJsonObjectField(
    const TSharedPtr<FJsonObject>& Obj,
    const FString& FieldName,
    TSharedPtr<FJsonObject>& OutValue)
{
    if (!Obj.IsValid()) return false;
    const TSharedPtr<FJsonObject>* FieldPtr = nullptr;
    if (!Obj->TryGetObjectField(FieldName, FieldPtr) || FieldPtr == nullptr)
    {
        return false;
    }
    OutValue = *FieldPtr;
    return OutValue.IsValid();
}

/** Try to read a string-array field from a JSON object. */
static bool ReadJsonStringArrayField(
    const TSharedPtr<FJsonObject>& Obj,
    const FString& FieldName,
    TArray<FString>& OutValues)
{
    OutValues.Reset();
    if (!Obj.IsValid()) return false;
    const TArray<TSharedPtr<FJsonValue>>* ArrayPtr = nullptr;
    if (!Obj->TryGetArrayField(FieldName, ArrayPtr) || ArrayPtr == nullptr)
    {
        return false;
    }
    for (const TSharedPtr<FJsonValue>& Value : *ArrayPtr)
    {
        if (!Value.IsValid() || Value->Type != EJson::String)
        {
            // Mixed-type or non-string arrays are not compatible with
            // the E84 typed-payload shape.
            OutValues.Reset();
            return false;
        }
        OutValues.Add(Value->AsString());
    }
    return true;
}

/**
 * Check whether every entry of `Prefixes` is a member of
 * `Allowed`. Returns true if `Prefixes` is non-empty and every
 * entry matches an entry in `Allowed`.
 */
static bool IsPrefixArraySubsetOf(
    const TArray<FString>& Prefixes,
    const TArray<FString>& Allowed)
{
    if (Prefixes.Num() == 0) return false;
    for (const FString& Prefix : Prefixes)
    {
        if (Prefix.IsEmpty()) return false;
        if (!Allowed.Contains(Prefix)) return false;
    }
    return true;
}

/**
 * E84 typed-payload preflight. Validates the E83 typed fix payload
 * attached to a `ReversibleWriteRequest` and emits a check-row array
 * suitable for inclusion in `ReversibleWriteResponse.preflight.checks`.
 *
 * The validator never inspects the `description` field or any
 * natural-language text on the request to decide mutation behavior.
 * The executable semantics are defined entirely by the structured
 * `typedPayload` (which must be present for this validator to be
 * called).
 */
static FOmueTypedPayloadValidationResult ValidateE84TypedPayload(
    const TSharedPtr<FJsonObject>& RequestObj,
    const FString& RequestTargetAssetPath)
{
    FOmueTypedPayloadValidationResult Result;

    // 1. Typed payload present.
    TSharedPtr<FJsonObject> TypedPayloadObj;
    if (!ReadJsonObjectField(RequestObj, TEXT("typedPayload"), TypedPayloadObj))
    {
        Result.Checks.Add(MakeWriteCheckValue(
            TEXT("typed_payload_present"),
            TEXT("Typed Payload Present"),
            false,
            TEXT("Request does not include a typedPayload field.")));
        Result.RefusalReason = TEXT("typed_payload_missing");
        Result.Message = TEXT("Write refused: typed payload is missing.");
        return Result;
    }
    Result.Checks.Add(MakeWriteCheckValue(
        TEXT("typed_payload_present"),
        TEXT("Typed Payload Present"),
        true,
        TEXT("Request includes a typedPayload field.")));

    // 2. Wrapper schema version.
    FString WrapperSchemaVersion;
    if (!ReadJsonStringField(TypedPayloadObj, TEXT("schemaVersion"), WrapperSchemaVersion) ||
        WrapperSchemaVersion != SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION)
    {
        Result.Checks.Add(MakeWriteCheckValue(
            TEXT("typed_payload_wrapper_schema_matches"),
            TEXT("Typed Payload Wrapper Schema"),
            false,
            FString::Printf(TEXT("Wrapper schemaVersion '%s' does not match '%s'."),
                *WrapperSchemaVersion, SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION)));
        Result.RefusalReason = TEXT("typed_payload_schema_mismatch");
        Result.Message = TEXT("Write refused: typed payload wrapper schema version does not match the active schema.");
        return Result;
    }
    Result.Checks.Add(MakeWriteCheckValue(
        TEXT("typed_payload_wrapper_schema_matches"),
        TEXT("Typed Payload Wrapper Schema"),
        true,
        TEXT("Wrapper schemaVersion matches the active schema.")));

    // 3. Payload object.
    TSharedPtr<FJsonObject> PayloadObj;
    if (!ReadJsonObjectField(TypedPayloadObj, TEXT("payload"), PayloadObj))
    {
        Result.Checks.Add(MakeWriteCheckValue(
            TEXT("typed_payload_body_schema_matches"),
            TEXT("Typed Payload Body Schema"),
            false,
            TEXT("Typed payload body object is missing or invalid.")));
        Result.RefusalReason = TEXT("typed_payload_invalid");
        Result.Message = TEXT("Write refused: typed payload body object is missing or invalid.");
        return Result;
    }

    // 4. Body schema version.
    FString BodySchemaVersion;
    if (!ReadJsonStringField(PayloadObj, TEXT("schemaVersion"), BodySchemaVersion) ||
        BodySchemaVersion != SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION)
    {
        Result.Checks.Add(MakeWriteCheckValue(
            TEXT("typed_payload_body_schema_matches"),
            TEXT("Typed Payload Body Schema"),
            false,
            FString::Printf(TEXT("Body schemaVersion '%s' does not match the wrapper."),
                *BodySchemaVersion)));
        Result.RefusalReason = TEXT("typed_payload_schema_mismatch");
        Result.Message = TEXT("Write refused: typed payload body schema version does not match the wrapper.");
        return Result;
    }
    Result.Checks.Add(MakeWriteCheckValue(
        TEXT("typed_payload_body_schema_matches"),
        TEXT("Typed Payload Body Schema"),
        true,
        TEXT("Body schemaVersion matches the wrapper.")));

    // 5. Operation kind.
    FString OperationKindStr;
    if (!ReadJsonStringField(PayloadObj, TEXT("operationKind"), OperationKindStr) ||
        !IsSupportedTypedPayloadOperationKind(OperationKindStr))
    {
        Result.Checks.Add(MakeWriteCheckValue(
            TEXT("typed_payload_operation_supported"),
            TEXT("Typed Payload Operation Kind"),
            false,
            FString::Printf(TEXT("Operation kind '%s' is not supported by typed-payload preflight."),
                *OperationKindStr)));
        Result.RefusalReason = TEXT("typed_payload_operation_unsupported");
        Result.Message = TEXT("Write refused: typed payload operation kind is not supported.");
        return Result;
    }
    Result.Checks.Add(MakeWriteCheckValue(
        TEXT("typed_payload_operation_supported"),
        TEXT("Typed Payload Operation Kind"),
        true,
        FString::Printf(TEXT("Operation kind '%s' is supported by typed-payload preflight."), *OperationKindStr)));

    // 6. Target matches.
    FString PayloadTarget;
    if (!ReadJsonStringField(PayloadObj, TEXT("targetAssetPath"), PayloadTarget))
    {
        Result.Checks.Add(MakeWriteCheckValue(
            TEXT("typed_payload_target_matches"),
            TEXT("Typed Payload Target Matches"),
            false,
            TEXT("Typed payload targetAssetPath is missing.")));
        Result.RefusalReason = TEXT("typed_payload_target_mismatch");
        Result.Message = TEXT("Write refused: typed payload target asset path is missing.");
        return Result;
    }
    if (PayloadTarget != RequestTargetAssetPath)
    {
        Result.Checks.Add(MakeWriteCheckValue(
            TEXT("typed_payload_target_matches"),
            TEXT("Typed Payload Target Matches"),
            false,
            FString::Printf(TEXT("Typed payload target '%s' does not match request target '%s'."),
                *PayloadTarget, *RequestTargetAssetPath)));
        Result.RefusalReason = TEXT("typed_payload_target_mismatch");
        Result.Message = TEXT("Write refused: typed payload target asset path does not match the request target.");
        return Result;
    }
    Result.Checks.Add(MakeWriteCheckValue(
        TEXT("typed_payload_target_matches"),
        TEXT("Typed Payload Target Matches"),
        true,
        TEXT("Typed payload target matches the request target.")));

    // 7. Target asset kind.
    FString TargetKind;
    if (!ReadJsonStringField(PayloadObj, TEXT("targetAssetKind"), TargetKind) ||
        TargetKind != SAFE_SCRATCH_BLUEPRINT_MUTATION_TARGET_KIND)
    {
        Result.Checks.Add(MakeWriteCheckValue(
            TEXT("typed_payload_target_kind_supported"),
            TEXT("Typed Payload Target Kind"),
            false,
            FString::Printf(TEXT("Target asset kind '%s' is not supported."), *TargetKind)));
        Result.RefusalReason = TEXT("typed_payload_operation_unsupported");
        Result.Message = TEXT("Write refused: typed payload target asset kind is not supported.");
        return Result;
    }
    Result.Checks.Add(MakeWriteCheckValue(
        TEXT("typed_payload_target_kind_supported"),
        TEXT("Typed Payload Target Kind"),
        true,
        TEXT("Target asset kind is blueprint_scratch_fixture.")));

    // 8. Allowlist compatibility.
    TArray<FString> PayloadAllowlist;
    if (!ReadJsonStringArrayField(PayloadObj, TEXT("allowlistPrefixes"), PayloadAllowlist) ||
        !IsPrefixArraySubsetOf(PayloadAllowlist, ALLOWED_SCRATCH_PREFIXES))
    {
        const FString Joined = FString::Join(PayloadAllowlist, TEXT(", "));
        Result.Checks.Add(MakeWriteCheckValue(
            TEXT("typed_payload_allowlist_compatible"),
            TEXT("Typed Payload Allowlist Compatible"),
            false,
            FString::Printf(TEXT("Typed payload allowlist prefixes [%s] are not a non-empty subset of the scratch/test allowlist."),
                *Joined)));
        Result.RefusalReason = TEXT("typed_payload_invalid");
        Result.Message = TEXT("Write refused: typed payload allowlist is not compatible with the scratch/test allowlist.");
        return Result;
    }
    Result.Checks.Add(MakeWriteCheckValue(
        TEXT("typed_payload_allowlist_compatible"),
        TEXT("Typed Payload Allowlist Compatible"),
        true,
        FString::Printf(TEXT("Typed payload allowlist prefixes [%s] are compatible with the scratch/test allowlist."),
            *FString::Join(PayloadAllowlist, TEXT(", ")))));

    // 9. Requires approval and snapshot.
    bool bRequireApproval = false;
    bool bPayloadRequireSnapshot = false;
    const bool bHasRequireApproval = ReadJsonBoolField(PayloadObj, TEXT("requireApproval"), bRequireApproval);
    const bool bHasRequireSnapshot = ReadJsonBoolField(PayloadObj, TEXT("requireSnapshot"), bPayloadRequireSnapshot);
    if (!bHasRequireApproval || !bHasRequireSnapshot || bRequireApproval != true || bPayloadRequireSnapshot != true)
    {
        Result.Checks.Add(MakeWriteCheckValue(
            TEXT("typed_payload_requires_approval_and_snapshot"),
            TEXT("Typed Payload Requires Approval and Snapshot"),
            false,
            TEXT("Typed payload must require both approval and snapshot.")));
        Result.RefusalReason = TEXT("typed_payload_invalid");
        Result.Message = TEXT("Write refused: typed payload must require both approval and snapshot.");
        return Result;
    }
    Result.Checks.Add(MakeWriteCheckValue(
        TEXT("typed_payload_requires_approval_and_snapshot"),
        TEXT("Typed Payload Requires Approval and Snapshot"),
        true,
        TEXT("Typed payload requires both approval and snapshot.")));

    // 10. Before state.
    TSharedPtr<FJsonObject> BeforeStateObj;
    FString BeforeStateKind;
    const bool bHasBeforeState = ReadJsonObjectField(PayloadObj, TEXT("beforeState"), BeforeStateObj)
        && ReadJsonStringField(BeforeStateObj, TEXT("kind"), BeforeStateKind);
    if (!bHasBeforeState || BeforeStateKind != SAFE_SCRATCH_BLUEPRINT_MUTATION_BEFORE_STATE_KIND)
    {
        Result.Checks.Add(MakeWriteCheckValue(
            TEXT("typed_payload_before_state_supported"),
            TEXT("Typed Payload Before State Supported"),
            false,
            FString::Printf(TEXT("Typed payload beforeState.kind '%s' is not supported by typed-payload preflight."),
                *BeforeStateKind)));
        Result.RefusalReason = TEXT("typed_payload_before_state_unsupported");
        Result.Message = TEXT("Write refused: typed payload beforeState is not supported.");
        return Result;
    }
    Result.Checks.Add(MakeWriteCheckValue(
        TEXT("typed_payload_before_state_supported"),
        TEXT("Typed Payload Before State Supported"),
        true,
        TEXT("Typed payload beforeState is missing_or_absent_allowed.")));

    // 11. After state non-empty.
    TSharedPtr<FJsonObject> AfterStateObj;
    if (!ReadJsonObjectField(PayloadObj, TEXT("afterState"), AfterStateObj))
    {
        Result.Checks.Add(MakeWriteCheckValue(
            TEXT("typed_payload_after_state_non_empty"),
            TEXT("Typed Payload After State"),
            false,
            TEXT("Typed payload afterState object is missing.")));
        Result.RefusalReason = TEXT("typed_payload_invalid");
        Result.Message = TEXT("Write refused: typed payload afterState object is missing.");
        return Result;
    }

    if (OperationKindStr == SAFE_SCRATCH_BLUEPRINT_MUTATION_OPERATION_KIND)
    {
        FString AfterStateKind;
        FString AfterStateKey;
        FString AfterStateValue;
        const bool bHasAfterState = ReadJsonStringField(AfterStateObj, TEXT("key"), AfterStateKey)
            && ReadJsonStringField(AfterStateObj, TEXT("value"), AfterStateValue);
        const bool bHasKind = ReadJsonStringField(AfterStateObj, TEXT("kind"), AfterStateKind);
        const bool bKindOk = !bHasKind || AfterStateKind == SAFE_SCRATCH_BLUEPRINT_MUTATION_METADATA_AFTER_STATE_KIND;
        if (!bHasAfterState || !bKindOk || AfterStateKey.IsEmpty() || AfterStateValue.IsEmpty())
        {
            Result.Checks.Add(MakeWriteCheckValue(
                TEXT("typed_payload_after_state_non_empty"),
                TEXT("Typed Payload After State Non-Empty"),
                false,
                TEXT("Typed payload metadata afterState must include a compatible kind plus non-empty key and value.")));
            Result.RefusalReason = TEXT("typed_payload_invalid");
            Result.Message = TEXT("Write refused: typed payload metadata afterState is invalid.");
            return Result;
        }
        Result.Checks.Add(MakeWriteCheckValue(
            TEXT("typed_payload_after_state_non_empty"),
            TEXT("Typed Payload After State Non-Empty"),
            true,
            TEXT("Typed payload metadata afterState key and value are both non-empty.")));
    }
    else
    {
        FString AfterStateKind;
        FString VariableName;
        FString DefaultValue;
        const bool bHasVariableAfterState = ReadJsonStringField(AfterStateObj, TEXT("kind"), AfterStateKind)
            && ReadJsonStringField(AfterStateObj, TEXT("variableName"), VariableName)
            && ReadJsonStringField(AfterStateObj, TEXT("defaultValue"), DefaultValue);
        if (!bHasVariableAfterState
            || AfterStateKind != SAFE_SCRATCH_BLUEPRINT_MUTATION_VARIABLE_AFTER_STATE_KIND
            || VariableName.IsEmpty())
        {
            Result.Checks.Add(MakeWriteCheckValue(
                TEXT("typed_payload_variable_name_non_empty"),
                TEXT("Typed Payload Variable Name Non-Empty"),
                false,
                TEXT("Typed payload variable-default afterState must include kind=variable_default and a non-empty variableName.")));
            Result.RefusalReason = TEXT("typed_payload_invalid");
            Result.Message = TEXT("Write refused: typed payload variable name is missing or invalid.");
            return Result;
        }
        Result.Checks.Add(MakeWriteCheckValue(
            TEXT("typed_payload_variable_name_non_empty"),
            TEXT("Typed Payload Variable Name Non-Empty"),
            true,
            FString::Printf(TEXT("Typed payload variableName '%s' is non-empty."), *VariableName)));

        if (DefaultValue.IsEmpty())
        {
            Result.Checks.Add(MakeWriteCheckValue(
                TEXT("typed_payload_variable_default_value_non_empty"),
                TEXT("Typed Payload Variable Default Value Non-Empty"),
                false,
                TEXT("Typed payload variable-default afterState must include a non-empty defaultValue.")));
            Result.RefusalReason = TEXT("typed_payload_invalid");
            Result.Message = TEXT("Write refused: typed payload variable default value is empty.");
            return Result;
        }
        Result.Checks.Add(MakeWriteCheckValue(
            TEXT("typed_payload_variable_default_value_non_empty"),
            TEXT("Typed Payload Variable Default Value Non-Empty"),
            true,
            TEXT("Typed payload variable default value is non-empty.")));
    }

    Result.bPassed = true;
    Result.Message = TEXT("All typed-payload preflight checks passed.");
    return Result;
}


// ── E85 canonical scratch fixture target path ────────────────────
// E85 is stricter than E84: even when the target path is in the
// scratch/test allowlist, E85 only mutates the exact canonical
// scratch fixture. Any other /Game/Scratch/ or /Game/Test/ path
// must be refused with `write_not_implemented`.
static const TCHAR* E85_CANONICAL_SCRATCH_FIXTURE_PATH =
    TEXT("/Game/Scratch/BP_OMUE_Scratch_Fixture");

/**
 * Build and send the E85 accepted write response with full capture.
 * Mirrors the Desktop mock response shape (mock-bridge-client.ts
 * lines 1489-1512) so mock and real bridge vocabulary stay aligned.
 */
static void SendE85AcceptedResponse(
    const FString& TargetAssetPath,
    const FString& OperationKind,
    const FString& MetadataKey,
    bool bKeyExisted,
    const FString& PreviousValue,
    const FString& RequestedValue,
    const FString& ApprovalId,
    const TArray<TSharedPtr<FJsonValue>>& Checks,
    const FHttpResultCallback& OnComplete)
{
    const FString Now = FDateTime::UtcNow().ToIso8601();
    // Stable snapshot ID: E85 bridge prefix + timestamp + approval suffix
    const FString SnapshotId = FString::Printf(TEXT("metadata-snap-%s-%s"),
        *Now.Replace(TEXT(":"), TEXT("-")).Replace(TEXT("."), TEXT("-")),
        *ApprovalId);

    TSharedPtr<FJsonObject> RootObj = MakeShareable(new FJsonObject);
    RootObj->SetBoolField(TEXT("success"), true);
    RootObj->SetStringField(TEXT("timestamp"), Now);

    TSharedPtr<FJsonObject> DataObj = MakeShareable(new FJsonObject);
    DataObj->SetBoolField(TEXT("success"), true);
    DataObj->SetStringField(TEXT("message"),
        FString::Printf(TEXT("Accepted the scratch metadata write on \"%s\" (key=\"%s\"). "
            "User-local UE validation is required; the package is dirty but not saved."),
            *TargetAssetPath, *MetadataKey));
    DataObj->SetStringField(TEXT("gateState"), TEXT("executed_pending_validation"));
    DataObj->SetBoolField(TEXT("requiresUserLocalValidation"), true);

    // ── preflight ───────────────────────────────────────────
    TSharedPtr<FJsonObject> PreflightObj = MakeShareable(new FJsonObject);
    PreflightObj->SetBoolField(TEXT("passed"), true);
    PreflightObj->SetArrayField(TEXT("checks"), Checks);
    DataObj->SetObjectField(TEXT("preflight"), PreflightObj);

    // ── metadata before-state capture ───────────────────────
    TSharedPtr<FJsonObject> MetadataObj = MakeShareable(new FJsonObject);
    MetadataObj->SetStringField(TEXT("key"), MetadataKey);
    MetadataObj->SetBoolField(TEXT("keyExisted"), bKeyExisted);
    if (bKeyExisted)
    {
        MetadataObj->SetStringField(TEXT("previousValue"), PreviousValue);
    }
    MetadataObj->SetStringField(TEXT("requestedValue"), RequestedValue);

    // ── E86 rollback payload (derived from before-state) ────
    const FString RollbackIntent = bKeyExisted
        ? TEXT("restore_metadata_value")
        : TEXT("remove_metadata_key");

    TSharedPtr<FJsonObject> RollbackPayloadObj = MakeShareable(new FJsonObject);
    RollbackPayloadObj->SetStringField(TEXT("intent"), RollbackIntent);
    RollbackPayloadObj->SetStringField(TEXT("targetAssetPath"), TargetAssetPath);
    RollbackPayloadObj->SetStringField(TEXT("operationKind"), OperationKind);
    RollbackPayloadObj->SetStringField(TEXT("metadataKey"), MetadataKey);
    RollbackPayloadObj->SetBoolField(TEXT("keyExisted"), bKeyExisted);
    if (bKeyExisted)
    {
        RollbackPayloadObj->SetStringField(TEXT("previousValue"), PreviousValue);
    }
    RollbackPayloadObj->SetStringField(TEXT("requestedValue"), RequestedValue);
    RollbackPayloadObj->SetStringField(TEXT("approvalId"), ApprovalId);
    RollbackPayloadObj->SetStringField(TEXT("snapshotId"), SnapshotId);
    RollbackPayloadObj->SetStringField(TEXT("writeTimestamp"), Now);
    RollbackPayloadObj->SetBoolField(TEXT("packageDirty"), true);
    RollbackPayloadObj->SetBoolField(TEXT("packageSaved"), false);

    // ── capture ─────────────────────────────────────────────
    TSharedPtr<FJsonObject> CaptureObj = MakeShareable(new FJsonObject);
    CaptureObj->SetStringField(TEXT("kind"), TEXT("scratch_metadata_marker"));
    CaptureObj->SetStringField(TEXT("targetAssetPath"), TargetAssetPath);
    CaptureObj->SetStringField(TEXT("operationKind"), OperationKind);
    CaptureObj->SetObjectField(TEXT("metadata"), MetadataObj);
    CaptureObj->SetStringField(TEXT("approvalId"), ApprovalId);
    CaptureObj->SetStringField(TEXT("snapshotId"), SnapshotId);
    CaptureObj->SetStringField(TEXT("timestamp"), Now);
    CaptureObj->SetBoolField(TEXT("packageDirty"), true);
    CaptureObj->SetBoolField(TEXT("packageSaved"), false);
    CaptureObj->SetObjectField(TEXT("rollback"), RollbackPayloadObj);

    // ── snapshot ────────────────────────────────────────────
    TSharedPtr<FJsonObject> SnapshotObj = MakeShareable(new FJsonObject);
    SnapshotObj->SetBoolField(TEXT("created"), true);
    SnapshotObj->SetStringField(TEXT("snapshotId"), SnapshotId);
    SnapshotObj->SetStringField(TEXT("snapshotAt"), Now);
    SnapshotObj->SetStringField(TEXT("label"),
        FString::Printf(TEXT("Metadata snapshot for %s"), *TargetAssetPath));
    SnapshotObj->SetNumberField(TEXT("operationCount"), 1);
    SnapshotObj->SetStringField(TEXT("sizeEstimate"), TEXT("bridge"));
    SnapshotObj->SetObjectField(TEXT("capture"), CaptureObj);
    SnapshotObj->SetStringField(TEXT("message"),
        FString::Printf(TEXT("Bridge captured before-state for key \"%s\" on %s; "
            "package is dirty but not saved by automation."),
            *MetadataKey, *TargetAssetPath));
    DataObj->SetObjectField(TEXT("snapshot"), SnapshotObj);

    // ── rollback (not attempted by E85) ─────────────────────
    TSharedPtr<FJsonObject> RollbackObj = MakeShareable(new FJsonObject);
    RollbackObj->SetBoolField(TEXT("attempted"), false);
    RollbackObj->SetStringField(TEXT("snapshotId"), SnapshotId);
    RollbackObj->SetStringField(TEXT("refusalReason"), TEXT("rollback_not_verified"));
    RollbackObj->SetStringField(TEXT("message"),
        FString::Printf(TEXT("Rollback was not attempted automatically. Rollback payload available: %s on key=\"%s\"."),
            *RollbackIntent, *MetadataKey));
    DataObj->SetObjectField(TEXT("rollback"), RollbackObj);

    RootObj->SetObjectField(TEXT("data"), DataObj);
    SendJsonResponse(RootObj, OnComplete, TEXT("HandleWriteScratchMetadata"));
}

static void SendE85_VariableDefaultAcceptedResponse(
    const FString& TargetAssetPath,
    const FString& VariableName,
    bool bPreviousDefaultExisted,
    const FString& PreviousDefaultValue,
    const FString& RequestedDefaultValue,
    const FString& ApprovalId,
    const TArray<TSharedPtr<FJsonValue>>& Checks,
    const FHttpResultCallback& OnComplete)
{
    const FString Now = FDateTime::UtcNow().ToIso8601();
    const FString SnapshotId = FString::Printf(TEXT("variable-snap-%s-%s"),
        *Now.Replace(TEXT(":"), TEXT("-")).Replace(TEXT("."), TEXT("-")),
        *ApprovalId);
    const FString RollbackIntent = bPreviousDefaultExisted
        ? TEXT("restore_variable_default")
        : TEXT("clear_variable_default");

    TSharedPtr<FJsonObject> RootObj = MakeShareable(new FJsonObject);
    RootObj->SetBoolField(TEXT("success"), true);
    RootObj->SetStringField(TEXT("timestamp"), Now);

    TSharedPtr<FJsonObject> DataObj = MakeShareable(new FJsonObject);
    DataObj->SetBoolField(TEXT("success"), true);
    DataObj->SetStringField(TEXT("message"),
        FString::Printf(TEXT("Accepted the scratch variable-default write on \"%s\" (variable=\"%s\"). User-local UE validation is required; the package is dirty but not saved."),
            *TargetAssetPath, *VariableName));
    DataObj->SetStringField(TEXT("gateState"), TEXT("executed_pending_validation"));
    DataObj->SetBoolField(TEXT("requiresUserLocalValidation"), true);

    TSharedPtr<FJsonObject> PreflightObj = MakeShareable(new FJsonObject);
    PreflightObj->SetBoolField(TEXT("passed"), true);
    PreflightObj->SetArrayField(TEXT("checks"), Checks);
    DataObj->SetObjectField(TEXT("preflight"), PreflightObj);

    TSharedPtr<FJsonObject> RollbackPayloadObj = MakeShareable(new FJsonObject);
    RollbackPayloadObj->SetStringField(TEXT("intent"), RollbackIntent);
    RollbackPayloadObj->SetStringField(TEXT("targetAssetPath"), TargetAssetPath);
    RollbackPayloadObj->SetStringField(TEXT("operationKind"), SAFE_SCRATCH_BLUEPRINT_MUTATION_VARIABLE_DEFAULT_OPERATION_KIND);
    RollbackPayloadObj->SetStringField(TEXT("variableName"), VariableName);
    RollbackPayloadObj->SetBoolField(TEXT("previousDefaultExisted"), bPreviousDefaultExisted);
    if (bPreviousDefaultExisted)
    {
        RollbackPayloadObj->SetStringField(TEXT("previousDefaultValue"), PreviousDefaultValue);
    }
    RollbackPayloadObj->SetStringField(TEXT("requestedDefaultValue"), RequestedDefaultValue);
    RollbackPayloadObj->SetStringField(TEXT("approvalId"), ApprovalId);
    RollbackPayloadObj->SetStringField(TEXT("snapshotId"), SnapshotId);
    RollbackPayloadObj->SetStringField(TEXT("writeTimestamp"), Now);
    RollbackPayloadObj->SetBoolField(TEXT("packageDirty"), true);
    RollbackPayloadObj->SetBoolField(TEXT("packageSaved"), false);

    TSharedPtr<FJsonObject> VariableObj = MakeShareable(new FJsonObject);
    VariableObj->SetStringField(TEXT("variableName"), VariableName);
    VariableObj->SetBoolField(TEXT("previousDefaultExisted"), bPreviousDefaultExisted);
    if (bPreviousDefaultExisted)
    {
        VariableObj->SetStringField(TEXT("previousDefaultValue"), PreviousDefaultValue);
    }
    VariableObj->SetStringField(TEXT("requestedDefaultValue"), RequestedDefaultValue);

    TSharedPtr<FJsonObject> CaptureObj = MakeShareable(new FJsonObject);
    CaptureObj->SetStringField(TEXT("kind"), TEXT("scratch_variable_default"));
    CaptureObj->SetStringField(TEXT("targetAssetPath"), TargetAssetPath);
    CaptureObj->SetStringField(TEXT("operationKind"), SAFE_SCRATCH_BLUEPRINT_MUTATION_VARIABLE_DEFAULT_OPERATION_KIND);
    CaptureObj->SetObjectField(TEXT("variable"), VariableObj);
    CaptureObj->SetStringField(TEXT("approvalId"), ApprovalId);
    CaptureObj->SetStringField(TEXT("snapshotId"), SnapshotId);
    CaptureObj->SetStringField(TEXT("timestamp"), Now);
    CaptureObj->SetBoolField(TEXT("packageDirty"), true);
    CaptureObj->SetBoolField(TEXT("packageSaved"), false);
    CaptureObj->SetObjectField(TEXT("rollback"), RollbackPayloadObj);

    TSharedPtr<FJsonObject> SnapshotObj = MakeShareable(new FJsonObject);
    SnapshotObj->SetBoolField(TEXT("created"), true);
    SnapshotObj->SetStringField(TEXT("snapshotId"), SnapshotId);
    SnapshotObj->SetStringField(TEXT("snapshotAt"), Now);
    SnapshotObj->SetStringField(TEXT("label"),
        FString::Printf(TEXT("Variable-default snapshot for %s"), *TargetAssetPath));
    SnapshotObj->SetNumberField(TEXT("operationCount"), 1);
    SnapshotObj->SetStringField(TEXT("sizeEstimate"), TEXT("bridge"));
    SnapshotObj->SetObjectField(TEXT("capture"), CaptureObj);
    SnapshotObj->SetStringField(TEXT("message"),
        FString::Printf(TEXT("Bridge captured before-state for variable \"%s\" on %s; package is dirty but not saved by automation."),
            *VariableName, *TargetAssetPath));
    DataObj->SetObjectField(TEXT("snapshot"), SnapshotObj);

    TSharedPtr<FJsonObject> RollbackObj = MakeShareable(new FJsonObject);
    RollbackObj->SetBoolField(TEXT("attempted"), false);
    RollbackObj->SetStringField(TEXT("snapshotId"), SnapshotId);
    RollbackObj->SetStringField(TEXT("refusalReason"), TEXT("rollback_not_verified"));
    RollbackObj->SetStringField(TEXT("message"),
        FString::Printf(TEXT("Rollback not attempted. Rollback payload available: %s on variable=\"%s\"."),
            *RollbackIntent, *VariableName));
    DataObj->SetObjectField(TEXT("rollback"), RollbackObj);

    RootObj->SetObjectField(TEXT("data"), DataObj);
    SendJsonResponse(RootObj, OnComplete, TEXT("HandleWriteScratch-VarDefault"));
}

// ═══════════════════════════════════════════════════════════════
// POST /write/scratch handler
// ═══════════════════════════════════════════════════════════════

static bool HandleWriteScratchRequestInternal(
    const FHttpServerRequest& Request,
    const FHttpResultCallback& OnComplete,
    const bool bSandboxApply)
{
    // ── 1. Parse JSON body ─────────────────────────────────────
    TSharedPtr<FJsonObject> RequestObj = ParseRequestBody(Request);

    if (!RequestObj.IsValid())
    {
        TArray<TSharedPtr<FJsonValue>> Checks;
        Checks.Add(MakeLegacyRefusalCheckValue(
            TEXT("approval_missing"),
            false,
            TEXT("Request body is empty or not valid JSON.")));
        SendWriteResponse(
            false,
            TEXT("blocked"),
            TEXT("Request body is empty or not valid JSON."),
            false, false,
            TEXT("approval_missing"),
            TEXT("INVALID_PARAMETER"),
            Checks,
            OnComplete);
        return true;
    }

    // ── 2. Extract fields ──────────────────────────────────────
    FString TargetAssetPath;
    FString Description;
    FString OperationKind;
    FString ApprovalId;
    FString ApprovedAt;
    bool bRequireSnapshot = false;

    GetJsonStringField(RequestObj, TEXT("targetAssetPath"), TargetAssetPath);
    GetJsonStringField(RequestObj, TEXT("description"), Description);
    GetJsonStringField(RequestObj, TEXT("operationKind"), OperationKind);

    // ── 3. Validate target asset path against allowlist ─────────
    TArray<TSharedPtr<FJsonValue>> Checks;
    Checks.Add(MakeWriteCheckValue(
        TEXT("request_json_valid"),
        TEXT("Request JSON Valid"),
        true,
        TEXT("Request body parsed as a JSON object.")));

    if (TargetAssetPath.IsEmpty())
    {
        Checks.Add(MakeWriteCheckValue(
            TEXT("target_path_present"),
            TEXT("Target Path Present"),
            false,
            TEXT("targetAssetPath is required and must not be empty.")));
        SendWriteResponse(
            false,
            TEXT("blocked"),
            TEXT("targetAssetPath is required and must not be empty."),
            false, false,
            TEXT("target_not_allowlisted"),
            TEXT("INVALID_PARAMETER"),
            Checks,
            OnComplete);
        return true;
    }
    Checks.Add(MakeWriteCheckValue(
        TEXT("target_path_present"),
        TEXT("Target Path Present"),
        true,
        FString::Printf(TEXT("Target path '%s' is present."), *TargetAssetPath)));

    if (!IsPathAllowlisted(TargetAssetPath))
    {
        Checks.Add(MakeWriteCheckValue(
            TEXT("target_path_allowlisted"),
            TEXT("Target Path Allowlisted"),
            false,
            FString::Printf(TEXT("Target path '%s' is not in /Game/Scratch/ or /Game/Test/."),
                *TargetAssetPath)));
        SendWriteResponse(
            false,
            TEXT("blocked"),
            FString::Printf(
                TEXT("Target path '%s' is not in the scratch/test allowlist. "
                     "Only /Game/Scratch/ and /Game/Test/ paths are permitted."),
                *TargetAssetPath),
            false, false,
            TEXT("target_not_allowlisted"),
            TEXT("FORBIDDEN"),
            Checks,
            OnComplete);
        return true;
    }
    Checks.Add(MakeWriteCheckValue(
        TEXT("target_path_allowlisted"),
        TEXT("Target Path Allowlisted"),
        true,
        FString::Printf(TEXT("Target path '%s' is in the scratch/test allowlist."), *TargetAssetPath)));

    if (!DoesBlueprintAssetExist(TargetAssetPath))
    {
        Checks.Add(MakeWriteCheckValue(
            TEXT("target_blueprint_exists"),
            TEXT("Target Blueprint Exists"),
            false,
            FString::Printf(TEXT("Target Blueprint '%s' was not found in the current UE project."),
                *TargetAssetPath)));
        SendWriteResponse(
            false,
            TEXT("blocked"),
            FString::Printf(
                TEXT("Target Blueprint '%s' was not found in the current UE project. "
                     "Create/select an allowlisted scratch Blueprint under /Game/Scratch/ or /Game/Test/ before executing."),
                *TargetAssetPath),
            false, false,
            TEXT("target_not_found"),
            TEXT("NOT_FOUND"),
            Checks,
            OnComplete);
        return true;
    }
    Checks.Add(MakeWriteCheckValue(
        TEXT("target_blueprint_exists"),
        TEXT("Target Blueprint Exists"),
        true,
        FString::Printf(TEXT("Target Blueprint '%s' exists in the current UE project."), *TargetAssetPath)));

    // ── 4. Validate approval metadata ──────────────────────────
    const TSharedPtr<FJsonObject>* ApprovalObj = nullptr;
    if (RequestObj->TryGetObjectField(TEXT("approval"), ApprovalObj) &&
        ApprovalObj != nullptr && ApprovalObj->IsValid())
    {
        GetJsonStringField(*ApprovalObj, TEXT("approvalId"), ApprovalId);
        GetJsonStringField(*ApprovalObj, TEXT("approvedAt"), ApprovedAt);
    }

    if (ApprovalId.IsEmpty() || ApprovedAt.IsEmpty())
    {
        Checks.Add(MakeWriteCheckValue(
            TEXT("approval_metadata_present"),
            TEXT("Approval Metadata Present"),
            false,
            TEXT("'approval.approvalId' and 'approval.approvedAt' must be non-empty.")));
        SendWriteResponse(
            false,
            TEXT("blocked"),
            TEXT("Approval metadata is required: 'approval.approvalId' "
                 "and 'approval.approvedAt' must be non-empty."),
            false, false,
            TEXT("approval_missing"),
            TEXT("APPROVAL_REQUIRED"),
            Checks,
            OnComplete);
        return true;
    }
    Checks.Add(MakeWriteCheckValue(
        TEXT("approval_metadata_present"),
        TEXT("Approval Metadata Present"),
        true,
        FString::Printf(TEXT("Approved by '%s' at '%s'."), *ApprovalId, *ApprovedAt)));

    // ── 5. Parse requireSnapshot (optional, defaults to false) ─
    RequestObj->TryGetBoolField(TEXT("requireSnapshot"), bRequireSnapshot);

    if (bRequireSnapshot != true)
    {
        Checks.Add(MakeWriteCheckValue(
            TEXT("request_require_snapshot"),
            TEXT("Request Requires Snapshot"),
            false,
            TEXT("Request must set requireSnapshot to true for safe scratch writes.")));
        SendWriteResponse(
            false,
            TEXT("blocked"),
            TEXT("Write request must set requireSnapshot to true for safe scratch writes."),
            false, false,
            TEXT("snapshot_required"),
            TEXT("SNAPSHOT_REQUIRED"),
            Checks,
            OnComplete);
        return true;
    }
    Checks.Add(MakeWriteCheckValue(
        TEXT("request_require_snapshot"),
        TEXT("Request Requires Snapshot"),
        true,
        TEXT("Request explicitly requires a snapshot.")));

    // ── 6. E84 typed-payload preflight ──────────────────────────
    // The validator never inspects `description` or any other
    // natural-language field. It only reads the structured
    // `typedPayload` object on the request.
    const FOmueTypedPayloadValidationResult TypedResult =
        ValidateE84TypedPayload(RequestObj, TargetAssetPath);
    for (const TSharedPtr<FJsonValue>& Check : TypedResult.Checks)
    {
        Checks.Add(Check);
    }
    if (!TypedResult.bPassed)
    {
        SendWriteResponse(
            false,
            TEXT("blocked"),
            TypedResult.Message,
            false, false,
            TypedResult.RefusalReason != nullptr ? TypedResult.RefusalReason : TEXT("typed_payload_invalid"),
            TEXT("TYPED_PAYLOAD_REFUSED"),
            Checks,
            OnComplete);
        return true;
    }

    // ── 7. Endpoint-specific target gate ─────────────────────────
    // Re-read typed payload to get execution-specific fields. Since E84
    // preflight passed, the payload is valid and these fields exist.
    TSharedPtr<FJsonObject> TypedPayloadObj;
    TSharedPtr<FJsonObject> PayloadObj;
    TSharedPtr<FJsonObject> AfterStateObj;
    FString PayloadTargetPath;
    FString PayloadOperationKind;
    FString AfterStateKey;
    FString AfterStateValue;
    FString AfterStateVariableName;
    FString AfterStateDefaultValue;
    FString AfterStateKind;

    ReadJsonObjectField(RequestObj, TEXT("typedPayload"), TypedPayloadObj);
    if (TypedPayloadObj.IsValid())
    {
        ReadJsonObjectField(TypedPayloadObj, TEXT("payload"), PayloadObj);
    }
    if (PayloadObj.IsValid())
    {
        ReadJsonStringField(PayloadObj, TEXT("targetAssetPath"), PayloadTargetPath);
        ReadJsonStringField(PayloadObj, TEXT("operationKind"), PayloadOperationKind);
        ReadJsonObjectField(PayloadObj, TEXT("afterState"), AfterStateObj);
    }
    if (AfterStateObj.IsValid())
    {
        ReadJsonStringField(AfterStateObj, TEXT("kind"), AfterStateKind);
        ReadJsonStringField(AfterStateObj, TEXT("key"), AfterStateKey);
        ReadJsonStringField(AfterStateObj, TEXT("value"), AfterStateValue);
        ReadJsonStringField(AfterStateObj, TEXT("variableName"), AfterStateVariableName);
        ReadJsonStringField(AfterStateObj, TEXT("defaultValue"), AfterStateDefaultValue);
    }

    if (bSandboxApply)
    {
        const bool bIsScratchTarget = TargetAssetPath.StartsWith(TEXT("/Game/Scratch/"))
            && PayloadTargetPath.StartsWith(TEXT("/Game/Scratch/"));
        if (!bIsScratchTarget)
        {
            Checks.Add(MakeWriteCheckValue(
                TEXT("target_scratch_allowlisted"),
                TEXT("Sandbox Target Scratch Allowlisted"),
                false,
                FString::Printf(TEXT("Sandbox apply only accepts /Game/Scratch/ targets. "
                    "Request target \"%s\" and payload target \"%s\" were refused."),
                    *TargetAssetPath,
                    *PayloadTargetPath)));

            SendWriteResponse(
                false,
                TEXT("blocked"),
                FString::Printf(
                    TEXT("Sandbox apply refused: target \"%s\" is not under /Game/Scratch/."),
                    *TargetAssetPath),
                false,
                true,
                TEXT("target_not_allowlisted"),
                TEXT("FORBIDDEN"),
                Checks,
                OnComplete);
            return true;
        }
        Checks.Add(MakeWriteCheckValue(
            TEXT("target_scratch_allowlisted"),
            TEXT("Sandbox Target Scratch Allowlisted"),
            true,
            FString::Printf(TEXT("Request and payload target are under /Game/Scratch/: \"%s\"."),
                *TargetAssetPath)));

        const bool bHasSandboxSuffix = TargetAssetPath.EndsWith(TEXT("_Sandbox"))
            && PayloadTargetPath.EndsWith(TEXT("_Sandbox"));
        if (!bHasSandboxSuffix)
        {
            Checks.Add(MakeWriteCheckValue(
                TEXT("target_sandbox_suffix"),
                TEXT("Sandbox Target Suffix"),
                false,
                FString::Printf(TEXT("Sandbox apply requires request and payload targets to end with "
                    "\"_Sandbox\". Request target \"%s\" and payload target \"%s\" were refused."),
                    *TargetAssetPath,
                    *PayloadTargetPath)));

            SendWriteResponse(
                false,
                TEXT("blocked"),
                FString::Printf(
                    TEXT("Sandbox apply refused: target \"%s\" must end with \"_Sandbox\"."),
                    *TargetAssetPath),
                false,
                true,
                TEXT("target_not_sandbox"),
                TEXT("INVALID_PARAMETER"),
                Checks,
                OnComplete);
            return true;
        }
        Checks.Add(MakeWriteCheckValue(
            TEXT("target_sandbox_suffix"),
            TEXT("Sandbox Target Suffix"),
            true,
            FString::Printf(TEXT("Request and payload target identify sandbox copy \"%s\"."),
                *TargetAssetPath)));
    }
    else
    {
        // E85 is stricter than E84: it only mutates the exact canonical
        // scratch fixture. Keep this gate unchanged for /write/scratch.
        const bool bIsCanonicalTarget = (TargetAssetPath == E85_CANONICAL_SCRATCH_FIXTURE_PATH)
            && (PayloadTargetPath == E85_CANONICAL_SCRATCH_FIXTURE_PATH);

        if (!bIsCanonicalTarget)
        {
            // Non-canonical scratch/test path: keep the existing
            // write_not_implemented refusal. E85 only executes on the
            // exact canonical scratch fixture.
            Checks.Add(MakeWriteCheckValue(
                TEXT("e85_canonical_target"),
                TEXT("Canonical Scratch Target"),
                false,
                FString::Printf(TEXT("This write operation only executes on \"%s\". "
                    "Request target \"%s\" and payload target \"%s\" must be canonical."),
                    E85_CANONICAL_SCRATCH_FIXTURE_PATH,
                    *TargetAssetPath,
                    *PayloadTargetPath)));

            SendWriteResponse(
                false,
                TEXT("blocked"),
                FString::Printf(
                    TEXT("Typed-payload preflight passed, but this operation only executes on "
                         "the canonical scratch fixture \"%s\". Request target \"%s\" "
                         "is not canonical. Refusing write."),
                    E85_CANONICAL_SCRATCH_FIXTURE_PATH,
                    *TargetAssetPath),
                false,
                true,
                TEXT("write_not_implemented"),
                TEXT("NOT_IMPLEMENTED"),
                Checks,
                OnComplete);
            return true;
        }
        Checks.Add(MakeWriteCheckValue(
            TEXT("e85_canonical_target"),
            TEXT("Canonical Scratch Target"),
            true,
            FString::Printf(TEXT("Request and payload target match the canonical scratch fixture \"%s\"."),
                E85_CANONICAL_SCRATCH_FIXTURE_PATH)));
    }

    // ── 8. E85 single safe scratch metadata write ───────────────
    // Gates passed: typed payload valid, canonical target,
    // approval present, requireSnapshot === true.
    //
    // Perform exactly one metadata marker write on the canonical
    // scratch Blueprint fixture. Before-state is captured for E86
    // rollback/history closure. The package is marked dirty but
    // NOT saved by automation.
    //
    // Exact UE 5.7 API evidence:
    //   UObject::Modify(bool) @ Object.h:308
    //   UObjectBaseUtility::MarkPackageDirty() @ UObjectBaseUtility.h:513
    //   UPackage::GetMetaData() → FMetaData& @ Package.h:1154
    //   FMetaData::FindValue(Object, Key) @ MetaData.h:136
    //   FMetaData::SetValue(Object, Key, Value) @ MetaData.h:173

    const FString BlueprintObjectPath = ToBlueprintObjectPath(TargetAssetPath);
    UBlueprint* Blueprint = Cast<UBlueprint>(
        StaticLoadObject(UBlueprint::StaticClass(), nullptr, *BlueprintObjectPath));

    if (!Blueprint)
    {
        Checks.Add(MakeWriteCheckValue(
            TEXT("e85_blueprint_load"),
            TEXT("Blueprint Load"),
            false,
            FString::Printf(TEXT("Failed to load Blueprint '%s' for the scratch write."),
                *BlueprintObjectPath)));

        SendWriteResponse(
            false,
            TEXT("blocked"),
            FString::Printf(TEXT("Write refused: failed to load Blueprint '%s'."),
                *BlueprintObjectPath),
            false,
            true,
            TEXT("snapshot_unavailable"),
            TEXT("LOAD_FAILED"),
            Checks,
            OnComplete);
        return true;
    }

    if (PayloadOperationKind == SAFE_SCRATCH_BLUEPRINT_MUTATION_VARIABLE_DEFAULT_OPERATION_KIND)
    {
        FBPVariableDescription* FoundVarDesc = nullptr;
        for (FBPVariableDescription& VarDesc : Blueprint->NewVariables)
        {
            if (VarDesc.VarName == FName(*AfterStateVariableName))
            {
                FoundVarDesc = &VarDesc;
                break;
            }
        }

        if (FoundVarDesc == nullptr)
        {
            Checks.Add(MakeWriteCheckValue(
                TEXT("typed_payload_variable_exists"),
                TEXT("Typed Payload Variable Exists"),
                false,
                FString::Printf(TEXT("Blueprint variable '%s' was not found on '%s'."),
                    *AfterStateVariableName, *TargetAssetPath)));

            SendWriteResponse(
                false,
                TEXT("blocked"),
                FString::Printf(TEXT("Write refused: Blueprint variable '%s' was not found on '%s'."),
                    *AfterStateVariableName, *TargetAssetPath),
                false,
                true,
                TEXT("target_not_found"),
                TEXT("TARGET_NOT_FOUND"),
                Checks,
                OnComplete);
            return true;
        }
        Checks.Add(MakeWriteCheckValue(
            TEXT("typed_payload_variable_exists"),
            TEXT("Typed Payload Variable Exists"),
            true,
            FString::Printf(TEXT("Blueprint variable '%s' exists on '%s'."),
                *AfterStateVariableName, *TargetAssetPath)));

        FString CompatibilityReason;
        const bool bDefaultCompatible = IsVariableDefaultValueCompatible(
            *FoundVarDesc,
            AfterStateDefaultValue,
            CompatibilityReason);
        Checks.Add(MakeWriteCheckValue(
            TEXT("typed_payload_variable_default_type_compatible"),
            TEXT("Typed Payload Variable Default Type Compatible"),
            bDefaultCompatible,
            CompatibilityReason));

        if (!bDefaultCompatible)
        {
            SendWriteResponse(
                false,
                TEXT("blocked"),
                FString::Printf(TEXT("Write refused: default value '%s' is not compatible with variable '%s'."),
                    *AfterStateDefaultValue, *AfterStateVariableName),
                false,
                true,
                TEXT("typed_payload_invalid"),
                TEXT("TYPED_PAYLOAD_INVALID"),
                Checks,
                OnComplete);
            return true;
        }

        const FString PreviousDefaultValue = FoundVarDesc->DefaultValue;
        const bool bPreviousDefaultExisted = !PreviousDefaultValue.IsEmpty();

        UClass* GeneratedClass = Blueprint->GeneratedClass;
        UObject* GeneratedCDO = GeneratedClass ? GeneratedClass->GetDefaultObject(false) : nullptr;
        FProperty* TargetProperty = GeneratedCDO
            ? FindFProperty<FProperty>(GeneratedCDO->GetClass(), FoundVarDesc->VarName)
            : nullptr;

        if (GeneratedCDO == nullptr || TargetProperty == nullptr)
        {
            Checks.Add(MakeWriteCheckValue(
                TEXT("typed_payload_variable_property_accessible"),
                TEXT("Typed Payload Variable Property Accessible"),
                false,
                FString::Printf(TEXT("GeneratedClass/CDO property for variable '%s' was not available on '%s'."),
                    *AfterStateVariableName, *TargetAssetPath)));

            SendWriteResponse(
                false,
                TEXT("blocked"),
                FString::Printf(TEXT("Write refused: Blueprint variable '%s' is not writable on the generated class for '%s'."),
                    *AfterStateVariableName, *TargetAssetPath),
                false,
                true,
                TEXT("snapshot_unavailable"),
                TEXT("WRITE_FAILED"),
                Checks,
                OnComplete);
            return true;
        }
        Checks.Add(MakeWriteCheckValue(
            TEXT("typed_payload_variable_property_accessible"),
            TEXT("Typed Payload Variable Property Accessible"),
            true,
            FString::Printf(TEXT("GeneratedClass/CDO property for variable '%s' is available on '%s'."),
                *AfterStateVariableName, *TargetAssetPath)));

        GeneratedCDO->Modify(true);
        Blueprint->Modify(true);

        const bool bPropertyWriteSucceeded = FBlueprintEditorUtils::PropertyValueFromString(
            TargetProperty,
            AfterStateDefaultValue,
            reinterpret_cast<uint8*>(GeneratedCDO),
            GeneratedCDO,
            PPF_SerializedAsImportText);

        FString ConfirmedDefaultValue;
        const bool bPropertyReadSucceeded = FBlueprintEditorUtils::PropertyValueToString(
            TargetProperty,
            reinterpret_cast<const uint8*>(GeneratedCDO),
            ConfirmedDefaultValue,
            GeneratedCDO,
            PPF_SerializedAsImportText);

        if (bPropertyWriteSucceeded && bPropertyReadSucceeded)
        {
            FoundVarDesc->DefaultValue = ConfirmedDefaultValue;
            FBlueprintEditorUtils::MarkBlueprintAsModified(Blueprint);
            Blueprint->MarkPackageDirty();
        }

        const bool bWriteConfirmed = bPropertyWriteSucceeded
            && bPropertyReadSucceeded
            && (FoundVarDesc->DefaultValue == ConfirmedDefaultValue);
        Checks.Add(MakeWriteCheckValue(
            TEXT("e85_write_confirmed"),
            TEXT("Write Confirmed"),
            bWriteConfirmed,
            bWriteConfirmed
                ? FString::Printf(TEXT("Variable '%s' default set to '%s' on '%s'. Package is dirty but not saved."),
                    *AfterStateVariableName, *FoundVarDesc->DefaultValue, *TargetAssetPath)
                : FString::Printf(TEXT("Variable '%s' default write/read-back failed (write=%s, read=%s, confirmed='%s', requested='%s')."),
                    *AfterStateVariableName,
                    bPropertyWriteSucceeded ? TEXT("true") : TEXT("false"),
                    bPropertyReadSucceeded ? TEXT("true") : TEXT("false"),
                    *ConfirmedDefaultValue,
                    *AfterStateDefaultValue)));

        if (!bWriteConfirmed)
        {
            SendWriteResponse(
                false,
                TEXT("blocked"),
                FString::Printf(TEXT("Variable-default write confirmation failed for '%s' on '%s'."),
                    *AfterStateVariableName, *TargetAssetPath),
                false,
                true,
                TEXT("snapshot_unavailable"),
                TEXT("WRITE_FAILED"),
                Checks,
                OnComplete);
            return true;
        }

        Checks.Add(MakeWriteCheckValue(
            TEXT("e84_preflight_passed"),
            TEXT("Typed Payload Preflight Passed"),
            true,
            TEXT("All typed-payload preflight checks passed. Variable-default execution completed.")));

        SendE85_VariableDefaultAcceptedResponse(
            TargetAssetPath,
            AfterStateVariableName,
            bPreviousDefaultExisted,
            PreviousDefaultValue,
            AfterStateDefaultValue,
            ApprovalId,
            Checks,
            OnComplete);
        return true;
    }

    // Before-state capture
    UPackage* Package = Blueprint->GetOutermost();
    FMetaData& PackageMetaData = Package->GetMetaData();

    const FString* ExistingValuePtr = PackageMetaData.FindValue(Blueprint, *AfterStateKey);
    const bool bKeyExisted = (ExistingValuePtr != nullptr);
    const FString OldValue = bKeyExisted ? *ExistingValuePtr : FString();

    // Perform the metadata write
    Blueprint->Modify(true);
    PackageMetaData.SetValue(Blueprint, *AfterStateKey, *AfterStateValue);
    Blueprint->MarkPackageDirty();

    // After-state verification (read back what we just wrote)
    const FString* ConfirmValuePtr = PackageMetaData.FindValue(Blueprint, *AfterStateKey);
    const bool bWriteConfirmed = (ConfirmValuePtr != nullptr)
        && (*ConfirmValuePtr == AfterStateValue);

    Checks.Add(MakeWriteCheckValue(
        TEXT("e85_write_confirmed"),
        TEXT("Write Confirmed"),
        bWriteConfirmed,
        bWriteConfirmed
            ? FString::Printf(TEXT("Metadata key '%s' set to '%s' on '%s'. "
                "Package is dirty but not saved."),
                *AfterStateKey, *AfterStateValue, *TargetAssetPath)
            : FString::Printf(TEXT("Metadata write may have failed: read-back for key '%s' "
                "returned '%s' instead of expected '%s'."),
                *AfterStateKey,
                ConfirmValuePtr ? **ConfirmValuePtr : TEXT("(null)"),
                *AfterStateValue)));

    if (!bWriteConfirmed)
    {
        SendWriteResponse(
            false,
            TEXT("blocked"),
            FString::Printf(TEXT("Metadata write confirmation failed for key '%s' on '%s'."),
                *AfterStateKey, *TargetAssetPath),
            false,
            true,
            TEXT("snapshot_unavailable"),
            TEXT("WRITE_FAILED"),
            Checks,
            OnComplete);
        return true;
    }

    // All gates passed and write confirmed. Send the E85 accepted
    // response with full capture for E86 rollback/history closure.
    Checks.Add(MakeWriteCheckValue(
        TEXT("e84_preflight_passed"),
        TEXT("Typed Payload Preflight Passed"),
        true,
        TEXT("All typed-payload preflight checks passed. Scratch metadata execution completed.")));

    SendE85AcceptedResponse(
        TargetAssetPath,
        SAFE_SCRATCH_BLUEPRINT_MUTATION_OPERATION_KIND,
        AfterStateKey,
        bKeyExisted,
        OldValue,
        AfterStateValue,
        ApprovalId,
        Checks,
        OnComplete);
    return true;
}

static bool HandleWriteScratchRequest(
    const FHttpServerRequest& Request,
    const FHttpResultCallback& OnComplete)
{
    return HandleWriteScratchRequestInternal(Request, OnComplete, false);
}

// POST /write/scratch/sandbox-apply handler (Agent Phase F fix-4).
// Reuses the existing E84 validation and E85 write execution while replacing
// the canonical target gate with a /Game/Scratch/ + _Sandbox gate.
static bool HandleWriteScratchSandboxApplyRequest(
    const FHttpServerRequest& Request,
    const FHttpResultCallback& OnComplete)
{
    return HandleWriteScratchRequestInternal(Request, OnComplete, true);
}

// ═══════════════════════════════════════════════════════════════
// POST /write/scratch/rollback handler (E71)
// ═══════════════════════════════════════════════════════════════

static bool HandleWriteScratchRollbackRequest(
    const FHttpServerRequest& Request,
    const FHttpResultCallback& OnComplete)
{
    // ── 1. Parse JSON body ─────────────────────────────────────
    TSharedPtr<FJsonObject> RequestObj = ParseRequestBody(Request);

    if (!RequestObj.IsValid())
    {
        SendRollbackResponse(
            false, TEXT("blocked"), false,
            TEXT("Request body is empty or not valid JSON."),
            TEXT("rollback_not_verified"),
            TEXT("rollback_not_verified"),
            TEXT("Rollback was not attempted because the request body was empty or invalid."),
            OnComplete, TEXT("HandleWriteScratchRollback-bad-body"));
        return true;
    }

    // ── 2. Validate targetAssetPath against allowlist ──────────
    FString TargetAssetPath;
    GetJsonStringField(RequestObj, TEXT("targetAssetPath"), TargetAssetPath);

    if (TargetAssetPath.IsEmpty() || !IsPathAllowlisted(TargetAssetPath))
    {
        SendRollbackResponse(
            false, TEXT("blocked"), false,
            FString::Printf(TEXT("Rollback refused: target path '%s' not allowlisted."),
                *TargetAssetPath),
            TEXT("target_not_allowlisted"),
            TEXT("target_not_allowlisted"),
            FString::Printf(TEXT("Target path '%s' is not in the scratch/test allowlist."),
                *TargetAssetPath),
            OnComplete, TEXT("HandleWriteScratchRollback-allowlist"));
        return true;
    }

    if (!DoesBlueprintAssetExist(TargetAssetPath))
    {
        SendRollbackResponse(
            false, TEXT("blocked"), false,
            FString::Printf(TEXT("Rollback refused: target Blueprint '%s' was not found."),
                *TargetAssetPath),
            TEXT("target_not_found"),
            TEXT("target_not_found"),
            FString::Printf(TEXT("Target Blueprint '%s' was not found in the current UE project."),
                *TargetAssetPath),
            OnComplete, TEXT("HandleWriteScratchRollback-target-not-found"));
        return true;
    }

    // ── 3. Return — rollback not verified during automation ──
    SendRollbackResponse(
        false, TEXT("blocked"), false,
        TEXT("Rollback request passed target validation, but executable rollback is not implemented."),
        TEXT("rollback_not_verified"),
        TEXT("rollback_not_verified"),
        TEXT("Rollback endpoint structure is ready. "
             "Actual rollback execution requires user-local "
             "UE compile, curl, and rollback verification."),
        OnComplete, TEXT("HandleWriteScratchRollback-not-verified"));
    return true;
}

// ═══════════════════════════════════════════════════════════════
// OPTIONS handler — CORS preflight for all registered endpoints.
//
// Returns empty body with CORS headers (Phase D fix).
// Browsers send OPTIONS before cross-origin GET when the
// request includes headers beyond the simple set (Accept alone
// counts as simple, but Content-Type would trigger preflight).
// Adding OPTIONS support keeps the door open for POST etc.
// ═══════════════════════════════════════════════════════════════

// POST /write/scratch/duplicate handler (Agent Phase C)
static bool HandleWriteScratchDuplicateRequest(
    const FHttpServerRequest& Request,
    const FHttpResultCallback& OnComplete)
{
    TSharedPtr<FJsonObject> RequestObj = ParseRequestBody(Request);
    if (!RequestObj.IsValid())
    {
        SendDuplicateResponse(
            false, TEXT(""), TEXT(""),
            TEXT("Duplicate refused: request body is empty or not valid JSON."),
            TEXT("approval_missing"), OnComplete);
        return true;
    }

    FString SourceAssetPath;
    FString TargetScratchPath;
    GetJsonStringField(RequestObj, TEXT("sourceAssetPath"), SourceAssetPath);
    GetJsonStringField(RequestObj, TEXT("targetScratchPath"), TargetScratchPath);

    if (SourceAssetPath.IsEmpty())
    {
        SendDuplicateResponse(
            false, TargetScratchPath, TEXT(""),
            TEXT("Duplicate refused: sourceAssetPath is required."),
            TEXT("source_not_found"), OnComplete);
        return true;
    }

    if (TargetScratchPath.IsEmpty() || !IsPathAllowlisted(TargetScratchPath))
    {
        SendDuplicateResponse(
            false, TargetScratchPath, TEXT(""),
            FString::Printf(TEXT("Duplicate refused: target scratch path '%s' is not allowlisted."),
                *TargetScratchPath),
            TEXT("target_not_allowlisted"), OnComplete);
        return true;
    }

    UBlueprint* SourceBlueprint = LoadBlueprintAsset(SourceAssetPath);
    if (!SourceBlueprint)
    {
        SendDuplicateResponse(
            false, TargetScratchPath, TEXT(""),
            FString::Printf(TEXT("Duplicate refused: source Blueprint '%s' was not found."),
                *SourceAssetPath),
            TEXT("source_not_found"), OnComplete);
        return true;
    }

    FString ApprovalId;
    FString ApprovedAt;
    if (!HasApprovalMetadata(RequestObj, ApprovalId, ApprovedAt))
    {
        SendDuplicateResponse(
            false, TargetScratchPath, TEXT(""),
            TEXT("Duplicate refused: approval metadata is missing or incomplete."),
            TEXT("approval_missing"), OnComplete);
        return true;
    }

    FString TargetPackagePath;
    FString TargetAssetName;
    if (!TrySplitLongAssetPath(TargetScratchPath, TargetPackagePath, TargetAssetName))
    {
        SendDuplicateResponse(
            false, TargetScratchPath, TEXT(""),
            TEXT("Duplicate refused: targetScratchPath must be a long package asset path without object suffix."),
            TEXT("duplicate_failed"), OnComplete);
        return true;
    }

    if (DoesBlueprintAssetExist(TargetScratchPath))
    {
        SendDuplicateResponse(
            false, TargetScratchPath, TEXT(""),
            FString::Printf(TEXT("Duplicate refused: target scratch Blueprint '%s' already exists."),
                *TargetScratchPath),
            TEXT("duplicate_failed"), OnComplete);
        return true;
    }

    UPackage* TargetPackage = CreatePackage(*TargetPackagePath);
    if (!TargetPackage)
    {
        SendDuplicateResponse(
            false, TargetScratchPath, TEXT(""),
            FString::Printf(TEXT("Duplicate failed: could not create package '%s'."),
                *TargetPackagePath),
            TEXT("duplicate_failed"), OnComplete);
        return true;
    }

    UBlueprint* ScratchBlueprint = DuplicateObject<UBlueprint>(
        SourceBlueprint,
        TargetPackage,
        *TargetAssetName);

    if (!ScratchBlueprint)
    {
        SendDuplicateResponse(
            false, TargetScratchPath, TEXT(""),
            FString::Printf(TEXT("Duplicate failed: could not duplicate '%s' to '%s'."),
                *SourceAssetPath, *TargetScratchPath),
            TEXT("duplicate_failed"), OnComplete);
        return true;
    }

    ScratchBlueprint->SetFlags(RF_Public | RF_Standalone);
    FAssetRegistryModule::AssetCreated(ScratchBlueprint);
    TargetPackage->MarkPackageDirty();
    ScratchBlueprint->MarkPackageDirty();

    const FString SnapshotId = FString::Printf(TEXT("phase-c-duplicate-%s-%s"),
        *FDateTime::UtcNow().ToIso8601().Replace(TEXT(":"), TEXT("-")).Replace(TEXT("."), TEXT("-")),
        *FGuid::NewGuid().ToString());

    SendDuplicateResponse(
        true,
        TargetScratchPath,
        SnapshotId,
        FString::Printf(TEXT("Duplicated '%s' to dirty unsaved scratch Blueprint '%s'. Package was not saved."),
            *SourceAssetPath, *TargetScratchPath),
        nullptr,
        OnComplete);
    return true;
}

// POST /compile/blueprint handler (Agent Phase C)
static bool HandleCompileBlueprintRequest(
    const FHttpServerRequest& Request,
    const FHttpResultCallback& OnComplete)
{
    const double StartSeconds = FPlatformTime::Seconds();
    TSharedPtr<FJsonObject> RequestObj = ParseRequestBody(Request);
    if (!RequestObj.IsValid())
    {
        SendCompileResponse(
            false, TArray<TSharedPtr<FJsonValue>>(), 0.0,
            TEXT("Compile refused: request body is empty or not valid JSON."),
            TEXT("approval_missing"), OnComplete);
        return true;
    }

    FString AssetPath;
    GetJsonStringField(RequestObj, TEXT("assetPath"), AssetPath);
    if (AssetPath.IsEmpty() || !IsScratchCompilePathAllowlisted(AssetPath))
    {
        SendCompileResponse(
            false, TArray<TSharedPtr<FJsonValue>>(), 0.0,
            FString::Printf(TEXT("Compile refused: asset path '%s' is not under /Game/Scratch/."),
                *AssetPath),
            TEXT("target_not_allowlisted"), OnComplete);
        return true;
    }

    UBlueprint* Blueprint = LoadBlueprintAsset(AssetPath);
    if (!Blueprint)
    {
        SendCompileResponse(
            false, TArray<TSharedPtr<FJsonValue>>(), 0.0,
            FString::Printf(TEXT("Compile refused: target Blueprint '%s' was not found."),
                *AssetPath),
            TEXT("target_not_found"), OnComplete);
        return true;
    }

    FString ApprovalId;
    FString ApprovedAt;
    if (!HasApprovalMetadata(RequestObj, ApprovalId, ApprovedAt))
    {
        SendCompileResponse(
            false, TArray<TSharedPtr<FJsonValue>>(), 0.0,
            TEXT("Compile refused: approval metadata is missing or incomplete."),
            TEXT("approval_missing"), OnComplete);
        return true;
    }

    if (GCompileReadCollector != nullptr && GCompileReadCollector->IsCompiling())
    {
        SendCompileResponse(
            false, TArray<TSharedPtr<FJsonValue>>(), 0.0,
            TEXT("Compile refused: another Blueprint compile is already in progress."),
            TEXT("compile_in_progress"), OnComplete);
        return true;
    }

    FKismetEditorUtilities::CompileBlueprint(Blueprint);

    bool bHasErrors = false;
    TArray<TSharedPtr<FJsonValue>> Issues = CollectBlueprintCompileIssues(Blueprint, bHasErrors);
    const EBlueprintStatus Status = Blueprint->Status;
    const bool bStatusFailed = Status == BS_Error;
    const bool bSuccess = !bHasErrors && !bStatusFailed;
    const double DurationMs = (FPlatformTime::Seconds() - StartSeconds) * 1000.0;

    SendCompileResponse(
        bSuccess,
        Issues,
        DurationMs,
        bSuccess
            ? FString::Printf(TEXT("Compiled scratch Blueprint '%s' successfully. Package was not saved."),
                *AssetPath)
            : FString::Printf(TEXT("Compiled scratch Blueprint '%s' with errors. Package was not saved."),
                *AssetPath),
        nullptr,
        OnComplete);
    return true;
}

static bool HandleOptionsRequest(
    const FHttpServerRequest& Request,
    const FHttpResultCallback& OnComplete)
{
    auto Response = FHttpServerResponse::Create(
        TEXT(""),
        TEXT("application/json; charset=utf-8"));
    AddCorsHeaders(Response);
    OnComplete(MoveTemp(Response));
    return true;
}

// ═══════════════════════════════════════════════════════════════
// Construction / Destruction
// ═══════════════════════════════════════════════════════════════

OmueHttpServer::OmueHttpServer()
    : Router(nullptr)
    , bIsRunning(false)
{
}

OmueHttpServer::~OmueHttpServer()
{
    Stop();
}

// ═══════════════════════════════════════════════════════════════
// Start / Stop
// ═══════════════════════════════════════════════════════════════

bool OmueHttpServer::Start(uint16 InPort)
{
    if (bIsRunning)
    {
        UE_LOG(LogOmueUnrealBridge, Warning,
            TEXT("OmueHttpServer::Start called but server is already running"));
        return true;
    }

    FHttpServerModule& HttpServerModule = FHttpServerModule::Get();

    Router = HttpServerModule.GetHttpRouter(InPort, true);

    if (!Router.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to get HTTP router for port %d. "
                 "Port may be in use or HTTPServer module unavailable."), InPort);
        return false;
    }

    RegisterRoutes();

    HttpServerModule.StartAllListeners();

    bIsRunning = true;
    UE_LOG(LogOmueUnrealBridge, Log,
        TEXT("HTTP server started on port %d"), InPort);

    return true;
}

void OmueHttpServer::Stop()
{
    if (!bIsRunning)
    {
        return;
    }

    FHttpServerModule& Module = FHttpServerModule::Get();
    Module.StopAllListeners();

    // Unbind every route handle before releasing the router.
    UnbindRoute(HealthRouteHandle);
    UnbindRoute(HealthOptionsRouteHandle);
    UnbindRoute(ProjectContextRouteHandle);
    UnbindRoute(ProjectContextOptionsRouteHandle);
    UnbindRoute(CurrentAssetRouteHandle);
    UnbindRoute(CurrentAssetOptionsRouteHandle);
    UnbindRoute(LogsRecentRouteHandle);
    UnbindRoute(LogsRecentOptionsRouteHandle);
    UnbindRoute(CompileStatusRouteHandle);
    UnbindRoute(CompileStatusOptionsRouteHandle);
    UnbindRoute(BlueprintSummaryRouteHandle);
    UnbindRoute(BlueprintSummaryOptionsRouteHandle);
    UnbindRoute(BlueprintGraphsRouteHandle);
    UnbindRoute(BlueprintGraphsOptionsRouteHandle);
    UnbindRoute(BlueprintGraphDetailRouteHandle);
    UnbindRoute(BlueprintGraphDetailOptionsRouteHandle);
    UnbindRoute(BehaviorTreeDiagnosticRouteHandle);
    UnbindRoute(BehaviorTreeDiagnosticOptionsRouteHandle);
    UnbindRoute(CapabilitiesRouteHandle);
    UnbindRoute(CapabilitiesOptionsRouteHandle);
    UnbindRoute(WriteScratchRouteHandle);
    UnbindRoute(WriteScratchOptionsRouteHandle);
    UnbindRoute(WriteScratchRollbackRouteHandle);
    UnbindRoute(WriteScratchRollbackOptionsRouteHandle);
    UnbindRoute(WriteScratchDuplicateRouteHandle);
    UnbindRoute(WriteScratchDuplicateOptionsRouteHandle);
    UnbindRoute(WriteScratchSandboxApplyRouteHandle);
    UnbindRoute(WriteScratchSandboxApplyOptionsRouteHandle);
    UnbindRoute(CompileBlueprintRouteHandle);
    UnbindRoute(CompileBlueprintOptionsRouteHandle);

    Router.Reset();

    bIsRunning = false;
    UE_LOG(LogOmueUnrealBridge, Log, TEXT("HTTP server stopped"));
}

bool OmueHttpServer::IsRunning() const
{
    return bIsRunning;
}

// ═══════════════════════════════════════════════════════════════
// Route registration
// ═══════════════════════════════════════════════════════════════

void OmueHttpServer::RegisterRoutes()
{
    if (!Router.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("RegisterRoutes called but Router is invalid"));
        return;
    }

    // ── GET /health (Phase B) ────────────────────────────────
    HealthRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/health")),
        EHttpServerRequestVerbs::VERB_GET,
        FHttpRequestHandler::CreateStatic(&HandleHealthRequest)
    );

    if (!HealthRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: GET /health"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: GET /health"));
    }

    // ── OPTIONS /health (CORS preflight) ─────────────────────
    HealthOptionsRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/health")),
        EHttpServerRequestVerbs::VERB_OPTIONS,
        FHttpRequestHandler::CreateStatic(&HandleOptionsRequest)
    );

    if (!HealthOptionsRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: OPTIONS /health"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: OPTIONS /health"));
    }

    // ── GET /context/project (Phase C) ───────────────────────
    ProjectContextRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/context/project")),
        EHttpServerRequestVerbs::VERB_GET,
        FHttpRequestHandler::CreateStatic(&HandleProjectContextRequest)
    );

    if (!ProjectContextRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: GET /context/project"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: GET /context/project"));
    }

    // ── OPTIONS /context/project (CORS preflight) ───────────
    ProjectContextOptionsRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/context/project")),
        EHttpServerRequestVerbs::VERB_OPTIONS,
        FHttpRequestHandler::CreateStatic(&HandleOptionsRequest)
    );

    if (!ProjectContextOptionsRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: OPTIONS /context/project"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: OPTIONS /context/project"));
    }

    // ── GET /context/current-asset (Phase E) ────────────────
    CurrentAssetRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/context/current-asset")),
        EHttpServerRequestVerbs::VERB_GET,
        FHttpRequestHandler::CreateStatic(&HandleCurrentAssetRequest)
    );

    if (!CurrentAssetRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: GET /context/current-asset"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: GET /context/current-asset"));
    }

    // ── OPTIONS /context/current-asset (CORS preflight) ─────
    CurrentAssetOptionsRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/context/current-asset")),
        EHttpServerRequestVerbs::VERB_OPTIONS,
        FHttpRequestHandler::CreateStatic(&HandleOptionsRequest)
    );

    if (!CurrentAssetOptionsRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: OPTIONS /context/current-asset"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: OPTIONS /context/current-asset"));
    }

    // ── GET /logs/recent (Phase G1) ──────────────────────────
    LogsRecentRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/logs/recent")),
        EHttpServerRequestVerbs::VERB_GET,
        FHttpRequestHandler::CreateStatic(&HandleLogsRecentRequest)
    );

    if (!LogsRecentRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: GET /logs/recent"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: GET /logs/recent"));
    }

    // ── OPTIONS /logs/recent (CORS preflight) ────────────────
    LogsRecentOptionsRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/logs/recent")),
        EHttpServerRequestVerbs::VERB_OPTIONS,
        FHttpRequestHandler::CreateStatic(&HandleOptionsRequest)
    );

    if (!LogsRecentOptionsRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: OPTIONS /logs/recent"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: OPTIONS /logs/recent"));
    }

    // ── GET /compile/status (Phase H1) ──────────────────────────
    CompileStatusRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/compile/status")),
        EHttpServerRequestVerbs::VERB_GET,
        FHttpRequestHandler::CreateStatic(&HandleCompileStatusRequest)
    );

    if (!CompileStatusRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: GET /compile/status"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: GET /compile/status"));
    }

    // ── OPTIONS /compile/status (CORS preflight) ────────────────
    CompileStatusOptionsRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/compile/status")),
        EHttpServerRequestVerbs::VERB_OPTIONS,
        FHttpRequestHandler::CreateStatic(&HandleOptionsRequest)
    );

    if (!CompileStatusOptionsRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: OPTIONS /compile/status"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: OPTIONS /compile/status"));
    }

    // ── GET /context/blueprint-summary (Phase K2a) ────────────
    BlueprintSummaryRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/context/blueprint-summary")),
        EHttpServerRequestVerbs::VERB_GET,
        FHttpRequestHandler::CreateStatic(&HandleBlueprintSummaryRequest)
    );

    if (!BlueprintSummaryRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: GET /context/blueprint-summary"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: GET /context/blueprint-summary"));
    }

    // ── OPTIONS /context/blueprint-summary (CORS preflight) ───
    BlueprintSummaryOptionsRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/context/blueprint-summary")),
        EHttpServerRequestVerbs::VERB_OPTIONS,
        FHttpRequestHandler::CreateStatic(&HandleOptionsRequest)
    );

    if (!BlueprintSummaryOptionsRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: OPTIONS /context/blueprint-summary"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: OPTIONS /context/blueprint-summary"));
    }

    // ── GET /context/blueprint-graphs (Phase K2b-1) ────────────
    BlueprintGraphsRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/context/blueprint-graphs")),
        EHttpServerRequestVerbs::VERB_GET,
        FHttpRequestHandler::CreateStatic(&HandleBlueprintGraphsRequest)
    );

    if (!BlueprintGraphsRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: GET /context/blueprint-graphs"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: GET /context/blueprint-graphs"));
    }

    // ── OPTIONS /context/blueprint-graphs (CORS preflight) ───
    BlueprintGraphsOptionsRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/context/blueprint-graphs")),
        EHttpServerRequestVerbs::VERB_OPTIONS,
        FHttpRequestHandler::CreateStatic(&HandleOptionsRequest)
    );

    if (!BlueprintGraphsOptionsRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: OPTIONS /context/blueprint-graphs"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: OPTIONS /context/blueprint-graphs"));
    }

    // ── GET /context/blueprint-graph-detail (Phase K2b-2b) ────
    BlueprintGraphDetailRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/context/blueprint-graph-detail")),
        EHttpServerRequestVerbs::VERB_GET,
        FHttpRequestHandler::CreateStatic(&HandleBlueprintGraphDetailRequest)
    );

    if (!BlueprintGraphDetailRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: GET /context/blueprint-graph-detail"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: GET /context/blueprint-graph-detail"));
    }

    // ── OPTIONS /context/blueprint-graph-detail (CORS preflight)
    BlueprintGraphDetailOptionsRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/context/blueprint-graph-detail")),
        EHttpServerRequestVerbs::VERB_OPTIONS,
        FHttpRequestHandler::CreateStatic(&HandleOptionsRequest)
    );

    if (!BlueprintGraphDetailOptionsRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: OPTIONS /context/blueprint-graph-detail"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: OPTIONS /context/blueprint-graph-detail"));
    }

    // ── GET /context/behavior-tree-diagnostic (Phase E62) ──
    BehaviorTreeDiagnosticRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/context/behavior-tree-diagnostic")),
        EHttpServerRequestVerbs::VERB_GET,
        FHttpRequestHandler::CreateStatic(&HandleBehaviorTreeDiagnosticRequest)
    );

    if (!BehaviorTreeDiagnosticRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: GET /context/behavior-tree-diagnostic"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: GET /context/behavior-tree-diagnostic"));
    }

    // ── OPTIONS /context/behavior-tree-diagnostic (CORS preflight)
    BehaviorTreeDiagnosticOptionsRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/context/behavior-tree-diagnostic")),
        EHttpServerRequestVerbs::VERB_OPTIONS,
        FHttpRequestHandler::CreateStatic(&HandleOptionsRequest)
    );

    if (!BehaviorTreeDiagnosticOptionsRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: OPTIONS /context/behavior-tree-diagnostic"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: OPTIONS /context/behavior-tree-diagnostic"));
    }

    // ── GET /capabilities (E70) ───────────────────────────────
    CapabilitiesRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/capabilities")),
        EHttpServerRequestVerbs::VERB_GET,
        FHttpRequestHandler::CreateStatic(&HandleCapabilitiesRequest)
    );

    if (!CapabilitiesRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: GET /capabilities"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: GET /capabilities"));
    }

    // ── OPTIONS /capabilities (CORS preflight) ────────────────
    CapabilitiesOptionsRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/capabilities")),
        EHttpServerRequestVerbs::VERB_OPTIONS,
        FHttpRequestHandler::CreateStatic(&HandleOptionsRequest)
    );

    if (!CapabilitiesOptionsRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: OPTIONS /capabilities"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: OPTIONS /capabilities"));
    }

    // ── POST /write/scratch (E71) ─────────────────────────────
    WriteScratchRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/write/scratch")),
        EHttpServerRequestVerbs::VERB_POST,
        FHttpRequestHandler::CreateStatic(&HandleWriteScratchRequest)
    );

    if (!WriteScratchRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: POST /write/scratch"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: POST /write/scratch"));
    }

    // ── OPTIONS /write/scratch (CORS preflight) ──────────────
    WriteScratchOptionsRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/write/scratch")),
        EHttpServerRequestVerbs::VERB_OPTIONS,
        FHttpRequestHandler::CreateStatic(&HandleOptionsRequest)
    );

    if (!WriteScratchOptionsRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: OPTIONS /write/scratch"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: OPTIONS /write/scratch"));
    }

    // ── POST /write/scratch/rollback (E71) ───────────────────
    WriteScratchRollbackRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/write/scratch/rollback")),
        EHttpServerRequestVerbs::VERB_POST,
        FHttpRequestHandler::CreateStatic(&HandleWriteScratchRollbackRequest)
    );

    if (!WriteScratchRollbackRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: POST /write/scratch/rollback"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: POST /write/scratch/rollback"));
    }

    // ── OPTIONS /write/scratch/rollback (CORS preflight) ─────
    WriteScratchRollbackOptionsRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/write/scratch/rollback")),
        EHttpServerRequestVerbs::VERB_OPTIONS,
        FHttpRequestHandler::CreateStatic(&HandleOptionsRequest)
    );

    if (!WriteScratchRollbackOptionsRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: OPTIONS /write/scratch/rollback"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: OPTIONS /write/scratch/rollback"));
    }

    WriteScratchDuplicateRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/write/scratch/duplicate")),
        EHttpServerRequestVerbs::VERB_POST,
        FHttpRequestHandler::CreateStatic(&HandleWriteScratchDuplicateRequest)
    );

    if (!WriteScratchDuplicateRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: POST /write/scratch/duplicate"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: POST /write/scratch/duplicate"));
    }

    WriteScratchDuplicateOptionsRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/write/scratch/duplicate")),
        EHttpServerRequestVerbs::VERB_OPTIONS,
        FHttpRequestHandler::CreateStatic(&HandleOptionsRequest)
    );

    if (!WriteScratchDuplicateOptionsRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: OPTIONS /write/scratch/duplicate"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: OPTIONS /write/scratch/duplicate"));
    }

    CompileBlueprintRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/compile/blueprint")),
        EHttpServerRequestVerbs::VERB_POST,
        FHttpRequestHandler::CreateStatic(&HandleCompileBlueprintRequest)
    );

    if (!CompileBlueprintRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: POST /compile/blueprint"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: POST /compile/blueprint"));
    }

    CompileBlueprintOptionsRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/compile/blueprint")),
        EHttpServerRequestVerbs::VERB_OPTIONS,
        FHttpRequestHandler::CreateStatic(&HandleOptionsRequest)
    );

    if (!CompileBlueprintOptionsRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: OPTIONS /compile/blueprint"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: OPTIONS /compile/blueprint"));
    }

    // ── POST /write/scratch/sandbox-apply (Agent Phase F fix-4) ──
    WriteScratchSandboxApplyRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/write/scratch/sandbox-apply")),
        EHttpServerRequestVerbs::VERB_POST,
        FHttpRequestHandler::CreateStatic(&HandleWriteScratchSandboxApplyRequest)
    );

    if (!WriteScratchSandboxApplyRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: POST /write/scratch/sandbox-apply"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: POST /write/scratch/sandbox-apply"));
    }

    // ── OPTIONS /write/scratch/sandbox-apply (CORS preflight) ────
    WriteScratchSandboxApplyOptionsRouteHandle = Router->BindRoute(
        FHttpPath(TEXT("/write/scratch/sandbox-apply")),
        EHttpServerRequestVerbs::VERB_OPTIONS,
        FHttpRequestHandler::CreateStatic(&HandleOptionsRequest)
    );

    if (!WriteScratchSandboxApplyOptionsRouteHandle.IsValid())
    {
        UE_LOG(LogOmueUnrealBridge, Error,
            TEXT("Failed to bind route: OPTIONS /write/scratch/sandbox-apply"));
    }
    else
    {
        UE_LOG(LogOmueUnrealBridge, Log,
            TEXT("Registered route: OPTIONS /write/scratch/sandbox-apply"));
    }
}

// ═══════════════════════════════════════════════════════════════
// Internal helper
// ═══════════════════════════════════════════════════════════════

void OmueHttpServer::UnbindRoute(FHttpRouteHandle& Handle)
{
    if (Router.IsValid() && Handle.IsValid())
    {
        Router->UnbindRoute(Handle);
        Handle.Reset();
    }
}
