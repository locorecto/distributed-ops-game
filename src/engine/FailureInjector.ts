import type { FailureEvent, ActiveFailure, FailureType } from './types'
import { nanoid } from 'nanoid'

export class FailureInjector {
  private script: FailureEvent[] = []
  private fired = new Set<number>()

  load(events: FailureEvent[]): void {
    this.script = [...events].sort((a, b) => a.atTick - b.atTick)
    this.fired.clear()
  }

  reset(): void {
    this.fired.clear()
  }

  /**
   * Returns events that should fire at the given tick.
   */
  getDueEvents(tick: number): FailureEvent[] {
    const due: FailureEvent[] = []
    for (const event of this.script) {
      if (event.atTick <= tick && !this.fired.has(event.atTick)) {
        due.push(event)
        this.fired.add(event.atTick)
      }
    }
    return due
  }
}

export function makeActiveFailure(
  event: FailureEvent,
  currentTick: number,
): ActiveFailure {
  return {
    id: nanoid(6),
    type: event.type as FailureType,
    startedAtTick: currentTick,
    affectedEntities: [event.target],
    severity: getSeverity(event.type as FailureType),
    isVisible: event.revealAtTick === undefined || event.revealAtTick <= currentTick,
  }
}

function getSeverity(type: FailureType): ActiveFailure['severity'] {
  switch (type) {
    case 'broker-down':
    case 'replication-failure':
    case 'record-too-large':
      return 'critical'
    case 'consumer-lag-spike':
    case 'duplicate-messages':
    case 'dlq-overflow':
    case 'sla-breach':
      return 'high'
    case 'message-ordering-violation':
    case 'schema-incompatibility':
    case 'consumer-crash':
      return 'medium'
    default:
      return 'low'
  }
}
