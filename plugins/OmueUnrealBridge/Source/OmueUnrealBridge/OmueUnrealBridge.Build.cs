// Copyright OMUE. All Rights Reserved.

using UnrealBuildTool;

public class OmueUnrealBridge : ModuleRules
{
    public OmueUnrealBridge(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        // Phase A dependencies (module skeleton):
        PublicDependencyModuleNames.AddRange(new string[]
        {
            "Core",
        });

        PrivateDependencyModuleNames.AddRange(new string[]
        {
            "CoreUObject",
            "Engine",
            "UnrealEd",
        });

        // Phase B dependencies (HTTP server + /health):
        PrivateDependencyModuleNames.AddRange(new string[]
        {
            "HTTP",
            "HTTPServer",
            "Json",
            "JsonUtilities",
        });

        // Phase E dependency (current asset selection):
        PrivateDependencyModuleNames.AddRange(new string[]
        {
            "ContentBrowser",
        });

        // Phase E6x dependency (Behavior Tree / Blackboard read-only diagnostic):
        // AIModule provides UBehaviorTree, UBlackboardData, UBTNode, UBTCompositeNode,
        // FBTCompositeChild, FBlackboardEntry, UBlackboardKeyType for read-only
        // BT asset diagnostic.  Only OmueBehaviorTreeReadCollector may include
        // AIModule/BehaviorTree headers.
        PrivateDependencyModuleNames.AddRange(new string[]
        {
            "AIModule",
        });

        // Phase K2b-1 dependency (Blueprint graph structure read-only):
        // BlueprintGraph provides UK2Node_Event, UK2Node_CustomEvent,
        // UK2Node_FunctionEntry for read-only node type identification.
        // Only OmueBlueprintStructureReadCollector may include BlueprintGraph headers.
        PrivateDependencyModuleNames.AddRange(new string[]
        {
            "BlueprintGraph",
        });

        // FML-1 dependency (MessageLog listing read-only probe):
        // MessageLog provides IMessageLogListing / GetFilteredMessages()
        // for read-only compile diagnostic inspection.  Only
        // OmueBlueprintCompileReadCollector may include MessageLog headers.
        PrivateDependencyModuleNames.AddRange(new string[]
        {
            "MessageLog",
        });

        // Phase K0 dependency (Blueprint read-only capabilities):
        // Kismet provides FKismetEditorUtilities and Blueprint compile
        // events for read-only compile status observation.  Only
        // OmueKismetReadinessProbe and *ReadCollector classes may
        // include Kismet headers.  No compile/export functionality
        // is implemented in K0.
        PrivateDependencyModuleNames.AddRange(new string[]
        {
            "Kismet",
        });

        // Phase C Agent sandbox endpoints:
        // AssetRegistry is used to announce in-memory scratch duplicates
        // created by /write/scratch/duplicate. Packages are dirtied but
        // never saved by the bridge.
        PrivateDependencyModuleNames.AddRange(new string[]
        {
            "AssetRegistry",
        });

        // Explicitly NOT included:
        // - "Slate"
        // - "SlateCore"
        // - "AssetRegistry"
        // - "BlueprintGraph"
        // - "WebSockets"       → Phase 4+
        // - "EditorScriptingUtilities"
    }
}
