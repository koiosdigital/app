import { apiClient } from './client'
import { getErrorMessage } from './errors'
import type { components } from '@/types/api'

// Response types
export type NemotoConfig = components['schemas']['NemotoConfigResponseDto']
export type NemotoQuietWindow = components['schemas']['NemotoQuietWindowDto']
export type NemotoPresetListItem = components['schemas']['NemotoPresetListItemDto']
export type NemotoPreset = components['schemas']['NemotoPresetResponseDto']
export type NemotoSchedule = components['schemas']['NemotoScheduleResponseDto']
export type NemotoScheduleAction = components['schemas']['NemotoScheduleActionDto']
export type NemotoLiveState = components['schemas']['NemotoLiveStateDto']
export type NemotoFlapDef = components['schemas']['NemotoFlapDefDto']
export type NemotoActivityEvent = components['schemas']['NemotoActivityEventDto']
export type CommandDispatchResult = components['schemas']['CommandDispatchResultDto']

// Request types
export type UpdateNemotoConfig = components['schemas']['UpdateNemotoConfigDto']
export type CreateNemotoPreset = components['schemas']['CreateNemotoPresetDto']
export type UpdateNemotoPreset = components['schemas']['UpdateNemotoPresetDto']
export type CreateNemotoSchedule = components['schemas']['CreateNemotoScheduleDto']
export type UpdateNemotoSchedule = components['schemas']['UpdateNemotoScheduleDto']

/**
 * Nemoto split-flap device API service.
 */
export const nemotoApi = {
  // ---- Flap set (static, device-agnostic) ----
  async getFlaps() {
    const { data, error } = await apiClient.GET('/v1/nemoto/flaps')
    if (error) throw new Error(getErrorMessage(error, 'Failed to fetch flaps'))
    return data
  },

  // ---- Config ----
  async getConfig(deviceId: string) {
    const { data, error } = await apiClient.GET('/v1/devices/{deviceId}/nemoto/config', {
      params: { path: { deviceId } },
    })
    if (error) throw new Error(getErrorMessage(error, 'Failed to fetch config'))
    return data
  },

  async updateConfig(deviceId: string, body: UpdateNemotoConfig) {
    const { data, error } = await apiClient.PUT('/v1/devices/{deviceId}/nemoto/config', {
      params: { path: { deviceId } },
      body,
    })
    if (error) throw new Error(getErrorMessage(error, 'Failed to update config'))
    return data
  },

  // ---- Presets ----
  async listPresets(deviceId: string) {
    const { data, error } = await apiClient.GET('/v1/devices/{deviceId}/nemoto/presets', {
      params: { path: { deviceId } },
    })
    if (error) throw new Error(getErrorMessage(error, 'Failed to fetch presets'))
    return data
  },

  async getPreset(deviceId: string, presetId: number) {
    const { data, error } = await apiClient.GET(
      '/v1/devices/{deviceId}/nemoto/presets/{presetId}',
      { params: { path: { deviceId, presetId } } },
    )
    if (error) throw new Error(getErrorMessage(error, 'Failed to fetch preset'))
    return data
  },

  async createPreset(deviceId: string, body: CreateNemotoPreset) {
    const { data, error } = await apiClient.POST('/v1/devices/{deviceId}/nemoto/presets', {
      params: { path: { deviceId } },
      body,
    })
    if (error) throw new Error(getErrorMessage(error, 'Failed to create preset'))
    return data
  },

  async updatePreset(deviceId: string, presetId: number, body: UpdateNemotoPreset) {
    const { data, error } = await apiClient.PUT(
      '/v1/devices/{deviceId}/nemoto/presets/{presetId}',
      { params: { path: { deviceId, presetId } }, body },
    )
    if (error) throw new Error(getErrorMessage(error, 'Failed to update preset'))
    return data
  },

  async deletePreset(deviceId: string, presetId: number) {
    const { error } = await apiClient.DELETE('/v1/devices/{deviceId}/nemoto/presets/{presetId}', {
      params: { path: { deviceId, presetId } },
    })
    if (error) throw new Error(getErrorMessage(error, 'Failed to delete preset'))
  },

  // ---- Schedules ----
  async listSchedules(deviceId: string) {
    const { data, error } = await apiClient.GET('/v1/devices/{deviceId}/nemoto/schedules', {
      params: { path: { deviceId } },
    })
    if (error) throw new Error(getErrorMessage(error, 'Failed to fetch schedules'))
    return data
  },

  async createSchedule(deviceId: string, body: CreateNemotoSchedule) {
    const { data, error } = await apiClient.POST('/v1/devices/{deviceId}/nemoto/schedules', {
      params: { path: { deviceId } },
      body,
    })
    if (error) throw new Error(getErrorMessage(error, 'Failed to create schedule'))
    return data
  },

  async updateSchedule(deviceId: string, scheduleId: number, body: UpdateNemotoSchedule) {
    const { data, error } = await apiClient.PUT(
      '/v1/devices/{deviceId}/nemoto/schedules/{scheduleId}',
      { params: { path: { deviceId, scheduleId } }, body },
    )
    if (error) throw new Error(getErrorMessage(error, 'Failed to update schedule'))
    return data
  },

  async deleteSchedule(deviceId: string, scheduleId: number) {
    const { error } = await apiClient.DELETE(
      '/v1/devices/{deviceId}/nemoto/schedules/{scheduleId}',
      { params: { path: { deviceId, scheduleId } } },
    )
    if (error) throw new Error(getErrorMessage(error, 'Failed to delete schedule'))
  },

  // ---- Live state + activity ----
  async getState(deviceId: string) {
    const { data, error } = await apiClient.GET('/v1/devices/{deviceId}/nemoto/state', {
      params: { path: { deviceId } },
    })
    if (error) throw new Error(getErrorMessage(error, 'Failed to fetch device state'))
    return data
  },

  async getActivity(deviceId: string, query?: { limit?: number; before?: string }) {
    const { data, error } = await apiClient.GET('/v1/devices/{deviceId}/nemoto/activity', {
      params: { path: { deviceId }, query },
    })
    if (error) throw new Error(getErrorMessage(error, 'Failed to fetch activity'))
    return data
  },

  // ---- Remote commands ----
  async showPreset(deviceId: string, presetId: number, forceQuiet = false) {
    const { data, error } = await apiClient.POST(
      '/v1/devices/{deviceId}/nemoto/commands/show-preset',
      { params: { path: { deviceId } }, body: { presetId, forceQuiet } },
    )
    if (error) throw new Error(getErrorMessage(error, 'Failed to show preset'))
    return data
  },

  async displayCell(
    deviceId: string,
    cell: { x: number; y: number; flap: number; forceQuiet?: boolean },
  ) {
    const { data, error } = await apiClient.POST(
      '/v1/devices/{deviceId}/nemoto/commands/display-cell',
      {
        params: { path: { deviceId } },
        body: { x: cell.x, y: cell.y, flap: cell.flap, forceQuiet: cell.forceQuiet ?? false },
      },
    )
    if (error) throw new Error(getErrorMessage(error, 'Failed to set cell'))
    return data
  },

  async displayClear(deviceId: string, forceQuiet = false) {
    const { data, error } = await apiClient.POST(
      '/v1/devices/{deviceId}/nemoto/commands/display-clear',
      { params: { path: { deviceId } }, body: { forceQuiet } },
    )
    if (error) throw new Error(getErrorMessage(error, 'Failed to clear display'))
    return data
  },

  async runScheduleNow(deviceId: string, scheduleId: number, forceQuiet = false) {
    const { data, error } = await apiClient.POST(
      '/v1/devices/{deviceId}/nemoto/commands/run-schedule-now',
      { params: { path: { deviceId } }, body: { scheduleId, forceQuiet } },
    )
    if (error) throw new Error(getErrorMessage(error, 'Failed to run schedule'))
    return data
  },

  async reboot(deviceId: string) {
    const { data, error } = await apiClient.POST('/v1/devices/{deviceId}/nemoto/commands/reboot', {
      params: { path: { deviceId } },
    })
    if (error) throw new Error(getErrorMessage(error, 'Failed to reboot device'))
    return data
  },
}
