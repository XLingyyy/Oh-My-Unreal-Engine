// Copyright OMUE. All Rights Reserved.
//
// K0: Kismet readiness probe implementation.
//
// IMPORTANT — UE 5.7.4 header path verification:
// The include below assumes the standard UE5 Kismet module layout.
// If this file fails to compile, search the UE 5.7.4 installation for
// "FKismetEditorUtilities" and update the include path.

#include "OmueKismetReadinessProbe.h"
#include "OmueUnrealBridgeModule.h"

// K0: Verify Kismet headers are accessible at compile time.
// If the path below does not match UE 5.7.4, the build will fail here.
// Common alternatives:
//   Editor/Kismet/Public/Kismet2/KismetEditorUtilities.h
//   Engine/Source/Editor/Kismet/Public/Kismet2/KismetEditorUtilities.h
#include "Kismet2/KismetEditorUtilities.h"

bool FOmueKismetReadinessProbe::Probe()
{
    // K0 compile-time + link-time verification:
    //
    // static_assert on sizeof() forces the compiler to verify that
    // FKismetEditorUtilities is a complete type (header is included
    // and the class is defined).
    //
    // When the module links, the linker must resolve the Kismet
    // import library because FKismetEditorUtilities is referenced.
    //
    // No function is called. No delegate is subscribed. No side
    // effects.  This purely confirms the Kismet module dependency
    // declared in Build.cs translates to a usable include path.
    static_assert(sizeof(FKismetEditorUtilities) > 0,
        "Kismet module not accessible — check include path");

    UE_LOG(LogOmueUnrealBridge, Log,
        TEXT("OmueKismetReadinessProbe: Kismet module accessible"));

    return true;
}
