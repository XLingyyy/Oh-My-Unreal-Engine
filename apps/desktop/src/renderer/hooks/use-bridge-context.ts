import { useState, useEffect, useCallback, useRef } from 'react';
import type { OmueContextSnapshot } from '@omue/shared-protocol';
import type { BridgeClient, BridgeHealth } from '../services/bridge-client';

interface BridgeContextState {
  snapshot: OmueContextSnapshot | null;
  health: BridgeHealth | null;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  lastUpdatedAt: string | null;
}

export function useBridgeContext(client: BridgeClient) {
  const isFirstLoad = useRef(true);

  const [state, setState] = useState<BridgeContextState>({
    snapshot: null,
    health: null,
    isInitialLoading: true,
    isRefreshing: false,
    error: null,
    lastUpdatedAt: null,
  });

  const loadContext = useCallback(async () => {
    const isFirst = isFirstLoad.current;

    if (isFirst) {
      setState(prev => ({ ...prev, isInitialLoading: true, error: null }));
    } else {
      setState(prev => ({ ...prev, isRefreshing: true, error: null }));
    }

    try {
      // 先取 health，再取 snapshot — 这样即使 snapshot 失败也能保留 health
      let health: BridgeHealth | null = null;
      try {
        health = await client.getHealth();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[OMUE] Bridge health check failed', e);
        throw new Error(`Failed to reach bridge — ${msg}`);
      }

      let snapshot: OmueContextSnapshot;
      try {
        snapshot = await client.getContextSnapshot();
      } catch (e) {
        // snapshot 失败但 health 成功 — 保留 health 信息，抛出 snapshot 错误
        const msg = e instanceof Error ? e.message : 'Failed to fetch context snapshot';
        setState(prev => ({
          ...prev,
          health,
          isInitialLoading: false,
          isRefreshing: false,
          error: msg,
          lastUpdatedAt: new Date().toISOString(),
        }));
        return;
      }

      setState({
        snapshot,
        health,
        isInitialLoading: false,
        isRefreshing: false,
        error: null,
        lastUpdatedAt: new Date().toISOString(),
      });
      isFirstLoad.current = false;
    } catch (e) {
      setState(prev => ({
        ...prev,
        isInitialLoading: false,
        isRefreshing: false,
        error: e instanceof Error ? e.message : 'Unknown error',
      }));
      isFirstLoad.current = false;
    }
  }, [client]);

  useEffect(() => {
    isFirstLoad.current = true;
    loadContext();
  }, [loadContext]);

  const refreshContext = useCallback(() => {
    loadContext();
  }, [loadContext]);

  return {
    ...state,
    refreshContext,
  };
}
