// Copyright OMUE. All Rights Reserved.
//
// READ-ONLY PROBE — KISMET ACCESS ALLOWED (diagnostic only).
//
// This file exists solely to confirm that the Kismet module can be
// linked in UE 5.7.4. It does not implement any business functionality.
// Do NOT extend this class into a general-purpose Kismet helper.
//
// K0: minimum viable dependency verification.

#pragma once

#include "CoreMinimal.h"

/**
 * Minimal Kismet dependency readiness probe.
 *
 * Phase K0: verifies that UE 5.7.4 Kismet module headers are
 * accessible and the module links successfully.
 *
 * This probe:
 * - Does NOT subscribe to any delegate.
 * - Does NOT read any Blueprint structure.
 * - Does NOT trigger any compilation.
 * - Does NOT return data to any HTTP handler.
 * - Only writes a single UE_LOG line.
 */
class FOmueKismetReadinessProbe
{
public:
    /** Run a minimal readiness check. Writes a single UE_LOG line. */
    static bool Probe();
};
