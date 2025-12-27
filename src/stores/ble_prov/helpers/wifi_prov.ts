import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { WiFiConfigPayloadSchema, WiFiConfigMsgType, CmdSetConfigSchema } from "@/types/proto/wifi_config_pb"
import { WifiStationState, WifiConnectFailedReason } from "@/types/proto/wifi_constants_pb"

export { WifiStationState, WifiConnectFailedReason }

export type WifiStatusResult = {
  /** Protobuf status (success/failure of the request itself) */
  status: number;
  /** WiFi station state */
  staState: WifiStationState;
  /** Connection failure reason (if staState is ConnectionFailed) */
  failReason?: WifiConnectFailedReason;
  /** Connected state details (if staState is Connected) */
  connected?: {
    ip4Addr: string;
    ssid: string;
    channel: number;
  };
  /** Attempt failed details (if connection attempt failed but retrying) */
  attemptFailed?: {
    attemptsRemaining: number;
  };
}

export const createGetStatusRequest = () => {
  const msg = create(WiFiConfigPayloadSchema);
  msg.msg = WiFiConfigMsgType.TypeCmdGetStatus;
  msg.payload.case = 'cmdGetStatus';
  return toBinary(WiFiConfigPayloadSchema, msg);
}

export const createSetConfigRequest = (ssid: string, password: string) => {
  const msg = create(WiFiConfigPayloadSchema);
  msg.msg = WiFiConfigMsgType.TypeCmdSetConfig;
  msg.payload.case = 'cmdSetConfig';
  msg.payload.value = create(CmdSetConfigSchema);
  msg.payload.value.ssid = new TextEncoder().encode(ssid);
  msg.payload.value.passphrase = new TextEncoder().encode(password);
  return toBinary(WiFiConfigPayloadSchema, msg);
}

export const createApplyConfigRequest = () => {
  const msg = create(WiFiConfigPayloadSchema);
  msg.msg = WiFiConfigMsgType.TypeCmdApplyConfig;
  msg.payload.case = 'cmdApplyConfig';
  return toBinary(WiFiConfigPayloadSchema, msg);
}

export const parseGetStatusResponse = (data: Uint8Array): WifiStatusResult => {
  const msg = fromBinary(WiFiConfigPayloadSchema, data);
  if (msg.msg !== WiFiConfigMsgType.TypeRespGetStatus) {
    throw new Error("Invalid message type");
  }
  if (msg.payload.case !== 'respGetStatus') {
    throw new Error("Invalid payload case");
  }

  const resp = msg.payload.value;
  const result: WifiStatusResult = {
    status: resp.status,
    staState: resp.staState,
  };

  // Parse the state oneof
  switch (resp.state.case) {
    case 'failReason':
      result.failReason = resp.state.value;
      break;
    case 'connected':
      result.connected = {
        ip4Addr: resp.state.value.ip4Addr,
        ssid: new TextDecoder().decode(resp.state.value.ssid),
        channel: resp.state.value.channel,
      };
      break;
    case 'attemptFailed':
      result.attemptFailed = {
        attemptsRemaining: resp.state.value.attemptsRemaining,
      };
      break;
  }

  return result;
}

export const parseSetConfigResponse = (data: Uint8Array) => {
  const msg = fromBinary(WiFiConfigPayloadSchema, data);
  if (msg.msg !== WiFiConfigMsgType.TypeRespSetConfig) {
    throw new Error("Invalid message type");
  }
  if (msg.payload.case !== 'respSetConfig') {
    throw new Error("Invalid payload case");
  }
  return msg.payload.value.status;
}

export const parseApplyConfigResponse = (data: Uint8Array) => {
  const msg = fromBinary(WiFiConfigPayloadSchema, data);
  if (msg.msg !== WiFiConfigMsgType.TypeRespApplyConfig) {
    throw new Error("Invalid message type");
  }
  if (msg.payload.case !== 'respApplyConfig') {
    throw new Error("Invalid payload case");
  }
  return msg.payload.value.status;
}
