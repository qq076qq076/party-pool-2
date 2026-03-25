import type { ServerMessage } from '@party-pool/shared'

export type LobbyStateMessage =
  | Extract<ServerMessage, { event: 'room_created' }>
  | Extract<ServerMessage, { event: 'room_joined' }>
  | Extract<ServerMessage, { event: 'room_state_updated' }>
  | Extract<ServerMessage, { event: 'ready_timer_started' }>
  | Extract<ServerMessage, { event: 'game_started' }>
  | Extract<ServerMessage, { event: 'round_started' }>
  | Extract<ServerMessage, { event: 'round_progress' }>
  | Extract<ServerMessage, { event: 'round_result' }>
  | Extract<ServerMessage, { event: 'error' }>
