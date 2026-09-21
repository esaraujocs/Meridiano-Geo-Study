// Fila de avisos de "nova conquista". Fica fora do React para o app inteiro poder empilhar avisos
// (fim de rodada, fim de partida, ferramenta de debug) sem depender de qual tela está aberta.
export type ToastAchievement = { id: string; name: string; description: string; rarity?: number; key: number };
export type ToastInput = Omit<ToastAchievement, "key">;

let queue: readonly ToastAchievement[] = [];
let serial = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export const achievementToasts = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  // Referência estável entre mudanças (exigência do useSyncExternalStore).
  snapshot: () => queue,
  push(items: ToastInput[]) {
    if (items.length === 0) return;
    queue = [...queue, ...items.map((item) => ({ ...item, key: ++serial }))];
    emit();
  },
  shift() {
    if (queue.length === 0) return;
    queue = queue.slice(1);
    emit();
  },
  clear() {
    if (queue.length === 0) return;
    queue = [];
    emit();
  },
};
