import { create } from 'zustand';

interface Point {
  x: number;
  y: number;
}

interface CanvasState {
  // State
  pan: Point;
  scale: number;
  isDraggingCanvas: boolean;
  mousePos: Point;
  
  // Actions
  setPan: (pan: Point | ((prev: Point) => Point)) => void;
  setScale: (scale: number | ((prev: number) => number)) => void;
  setIsDraggingCanvas: (isDragging: boolean) => void;
  setMousePos: (pos: Point) => void;
  
  // High-level operations (previously in hook)
  zoomCanvas: (delta: number, screenX?: number, screenY?: number) => void;
  resetCanvas: () => void;
  
  // Coordinate transformers can be derived directly by components
  // or provided as helpers in the store
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  pan: { x: 0, y: 0 },
  scale: 1,
  isDraggingCanvas: false,
  mousePos: { x: 0, y: 0 },

  setPan: (pan) => set((state) => ({ 
    pan: typeof pan === 'function' ? pan(state.pan) : pan 
  })),

  setScale: (scale) => set((state) => ({ 
    scale: typeof scale === 'function' ? scale(state.scale) : scale 
  })),

  setIsDraggingCanvas: (isDragging) => set({ isDraggingCanvas: isDragging }),
  
  setMousePos: (pos) => set({ mousePos: pos }),

  zoomCanvas: (delta, screenX, screenY) => {
    const { scale: currentScale, pan: currentPan, setScale, setPan } = get();
    
    if (screenX !== undefined && screenY !== undefined) {
       const worldX = (screenX - currentPan.x) / currentScale;
       const worldY = (screenY - currentPan.y) / currentScale;

       const newScale = Math.max(0.2, Math.min(3, currentScale + delta));

       const newPanX = screenX - worldX * newScale;
       const newPanY = screenY - worldY * newScale;

       setPan({ x: newPanX, y: newPanY });
       setScale(newScale);
    } else {
       setScale(Math.max(0.2, Math.min(3, currentScale + delta)));
    }
  },

  resetCanvas: () => set({ pan: { x: 0, y: 0 }, scale: 1 }),
}));
