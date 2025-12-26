import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { WiFiConfigPayloadSchema, WiFiConfigMsgType, CmdSetConfigSchema } from "@/types/proto/wifi_config_pb"

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

export const parseGetStatusResponse = (data: Uint8Array) => {
  const msg = fromBinary(WiFiConfigPayloadSchema, data);
  if (msg.msg !== WiFiConfigMsgType.TypeRespGetStatus) {
    throw new Error("Invalid message type");
  }
  if (msg.payload.case !== 'respGetStatus') {
    throw new Error("Invalid payload case");
  }
  return msg.payload.value;
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
