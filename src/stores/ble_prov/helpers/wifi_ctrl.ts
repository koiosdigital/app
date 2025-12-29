import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import { WiFiCtrlMsgType, WiFiCtrlPayloadSchema } from '@/types/proto/wifi_ctrl_pb'

export const createCtrlReset = () => {
  const msg = create(WiFiCtrlPayloadSchema)
  msg.msg = WiFiCtrlMsgType.TypeCmdCtrlReset
  msg.payload.case = 'cmdCtrlReset'
  return toBinary(WiFiCtrlPayloadSchema, msg)
}

export const createCtrlReprov = () => {
  const msg = create(WiFiCtrlPayloadSchema)
  msg.msg = WiFiCtrlMsgType.TypeCmdCtrlReprov
  msg.payload.case = 'cmdCtrlReprov'
  return toBinary(WiFiCtrlPayloadSchema, msg)
}

export const parseCtrlResetResponse = (data: Uint8Array) => {
  const msg = fromBinary(WiFiCtrlPayloadSchema, data)
  if (msg.msg !== WiFiCtrlMsgType.TypeRespCtrlReset) {
    throw new Error('Invalid message type')
  }
  if (msg.payload.case !== 'respCtrlReset') {
    throw new Error('Invalid payload case')
  }
  return msg.status
}

export const parseCtrlReprovResponse = (data: Uint8Array) => {
  const msg = fromBinary(WiFiCtrlPayloadSchema, data)
  if (msg.msg !== WiFiCtrlMsgType.TypeRespCtrlReprov) {
    throw new Error('Invalid message type')
  }
  if (msg.payload.case !== 'respCtrlReprov') {
    throw new Error('Invalid payload case')
  }
  return msg.status
}
