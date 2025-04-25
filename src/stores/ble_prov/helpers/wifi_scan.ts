import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { CmdScanResultSchema, CmdScanStartSchema, WiFiScanMsgType, WiFiScanPayloadSchema } from "../proto/wifi_scan_pb";
import { Status } from "../proto/constants_pb";

export const createScanStartRequest = (blocking: boolean = true, passive: boolean = false, group_channels: number = 5, period_ms: number = 120) => {
  const msg = create(WiFiScanPayloadSchema);
  msg.msg = WiFiScanMsgType.TypeCmdScanStart;
  msg.payload.case = 'cmdScanStart';
  msg.payload.value = create(CmdScanStartSchema);
  msg.payload.value.blocking = blocking;
  msg.payload.value.passive = passive;
  msg.payload.value.groupChannels = group_channels;
  msg.payload.value.periodMs = period_ms;
  return toBinary(WiFiScanPayloadSchema, msg);
}

export const createScanStatusRequest = () => {
  const msg = create(WiFiScanPayloadSchema);
  msg.msg = WiFiScanMsgType.TypeCmdScanStatus;
  msg.payload.case = 'cmdScanStatus';
  return toBinary(WiFiScanPayloadSchema, msg);
}

export const createScanResultRequest = (n: number, start: number) => {
  const msg = create(WiFiScanPayloadSchema);
  msg.msg = WiFiScanMsgType.TypeCmdScanResult;
  msg.payload.case = 'cmdScanResult';
  msg.payload.value = create(CmdScanResultSchema);
  msg.payload.value.startIndex = start;
  msg.payload.value.count = n;
  return toBinary(WiFiScanPayloadSchema, msg);
}

export const parseScanStartResponse = (data: Uint8Array) => {
  const msg = fromBinary(WiFiScanPayloadSchema, data);
  if (msg.msg !== WiFiScanMsgType.TypeRespScanStart) {
    throw new Error("Invalid message type");
  }
  if (msg.payload.case !== 'respScanStart') {
    throw new Error("Invalid payload case");
  }
  return msg.status;
}

export const parseScanStatusResponse = (data: Uint8Array) => {
  const msg = fromBinary(WiFiScanPayloadSchema, data);
  if (msg.msg !== WiFiScanMsgType.TypeRespScanStatus) {
    throw new Error("Invalid message type");
  }
  if (msg.payload.case !== 'respScanStatus') {
    throw new Error("Invalid payload case");
  }
  if (msg.status !== Status.Success) {
    throw new Error("Invalid status");
  }
  return {
    finished: msg.payload.value.scanFinished,
    count: msg.payload.value.resultCount,
  }
}

export const parseScanResultResponse = (data: Uint8Array) => {
  const msg = fromBinary(WiFiScanPayloadSchema, data);
  if (msg.msg !== WiFiScanMsgType.TypeRespScanResult) {
    throw new Error("Invalid message type");
  }
  if (msg.payload.case !== 'respScanResult') {
    throw new Error("Invalid payload case");
  }
  const entries = [];

  for (const entry of msg.payload.value.entries) {
    const ssid = new TextDecoder().decode(entry.ssid);
    const bssid = new TextDecoder().decode(entry.bssid);
    const rssi = entry.rssi;
    const channel = entry.channel;
    const auth = entry.auth;
    entries.push({ ssid, bssid, rssi, channel, auth });
  }

  return entries;
}
