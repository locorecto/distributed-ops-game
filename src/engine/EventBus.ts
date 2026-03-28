type Handler<T = unknown> = (payload: T) => void

export class EventBus {
  private listeners: Map<string, Handler[]> = new Map()

  on<T>(event: string, handler: Handler<T>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, [])
    this.listeners.get(event)!.push(handler as Handler)
    return () => this.off(event, handler as Handler)
  }

  off(event: string, handler: Handler): void {
    const handlers = this.listeners.get(event)
    if (!handlers) return
    const idx = handlers.indexOf(handler)
    if (idx !== -1) handlers.splice(idx, 1)
  }

  emit<T>(event: string, payload?: T): void {
    const handlers = this.listeners.get(event)
    if (!handlers) return
    handlers.forEach(h => h(payload))
  }

  clear(): void {
    this.listeners.clear()
  }
}
