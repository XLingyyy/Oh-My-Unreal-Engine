import { useEffect, useState } from 'react';

export type WorkbenchLayout = 'full' | 'narrow' | 'inspectorDrawer' | 'compact';

export interface WorkbenchResponsiveState {
  layout: WorkbenchLayout;
  inspectorDrawerOpen: boolean;
  setInspectorDrawerOpen: (open: boolean) => void;
  toggleInspectorDrawer: () => void;
  projectExplorerCollapsed: boolean;
  setProjectExplorerCollapsed: (collapsed: boolean) => void;
  toggleProjectExplorer: () => void;
}

const NARROW_MAX = 1439;
const INSPECTOR_DRAWER_MAX = 1199;
const COMPACT_MAX = 899;

function resolveLayout(width: number): WorkbenchLayout {
  if (width <= COMPACT_MAX) {
    return 'compact';
  }
  if (width <= INSPECTOR_DRAWER_MAX) {
    return 'inspectorDrawer';
  }
  if (width <= NARROW_MAX) {
    return 'narrow';
  }
  return 'full';
}

function getCurrentLayout(): WorkbenchLayout {
  return typeof window === 'undefined' ? 'full' : resolveLayout(window.innerWidth);
}

function canUseMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

export function useWorkbenchResponsiveState(): WorkbenchResponsiveState {
  const [layout, setLayout] = useState<WorkbenchLayout>(() => getCurrentLayout());
  const [inspectorDrawerOpen, setInspectorDrawerOpen] = useState(false);
  const [projectExplorerCollapsed, setProjectExplorerCollapsed] = useState(
    () => getCurrentLayout() === 'compact',
  );

  useEffect(() => {
    if (!canUseMatchMedia()) {
      return undefined;
    }

    const compactQuery = window.matchMedia(`(max-width: ${COMPACT_MAX}px)`);
    const drawerQuery = window.matchMedia(`(max-width: ${INSPECTOR_DRAWER_MAX}px)`);
    const narrowQuery = window.matchMedia(`(max-width: ${NARROW_MAX}px)`);

    const update = () => {
      const width = window.innerWidth;
      setLayout(resolveLayout(width));
    };

    update();

    compactQuery.addEventListener('change', update);
    drawerQuery.addEventListener('change', update);
    narrowQuery.addEventListener('change', update);

    return () => {
      compactQuery.removeEventListener('change', update);
      drawerQuery.removeEventListener('change', update);
      narrowQuery.removeEventListener('change', update);
    };
  }, []);

  useEffect(() => {
    if (layout !== 'inspectorDrawer' && layout !== 'compact') {
      setInspectorDrawerOpen(false);
    }
  }, [layout]);

  useEffect(() => {
    setProjectExplorerCollapsed(layout === 'compact');
  }, [layout]);

  return {
    layout,
    inspectorDrawerOpen,
    setInspectorDrawerOpen,
    toggleInspectorDrawer: () => setInspectorDrawerOpen(prev => !prev),
    projectExplorerCollapsed,
    setProjectExplorerCollapsed,
    toggleProjectExplorer: () => setProjectExplorerCollapsed(prev => !prev),
  };
}
