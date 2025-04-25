import { defineStore } from "pinia";
import { BleCharacteristic, BleClient, BleDevice } from "@capacitor-community/bluetooth-le";
import { ref } from "vue";
import { Security1 } from "./helpers/security/security_1";
import { KD_DSParams, KDCryptoStatus } from "./helpers/kd_console";
import { createScanResultRequest, createScanStartRequest, createScanStatusRequest, parseScanResultResponse, parseScanStartResponse, parseScanStatusResponse } from "./helpers/wifi_scan";
import { createApplyConfigRequest, createGetStatusRequest, createSetConfigRequest, parseApplyConfigResponse, parseGetStatusResponse, parseSetConfigResponse } from "./helpers/wifi_prov";

export type WifiAP = ReturnType<typeof parseScanResultResponse>[number];

export const useBleProvStore = defineStore("ble_prov", () => {
  const connectedDevice = ref<BleDevice | undefined>(undefined);
  const connectedDeviceServiceMap = ref<Map<string, BleCharacteristic>>(new Map());
  const sessionEstablished = ref(false);
  const discoveredAPs = ref<WifiAP[]>([]);
  const scanningForAPs = ref(false);
  const connectingToAP = ref<WifiAP | undefined>(undefined);
  const connectedToAP = ref(false);
  let connCheckInterval: ReturnType<typeof setInterval> | undefined = undefined;

  let sec1: Security1 | undefined = undefined;

  //MARK: Bluetooth
  const initializeBluetooth = async () => {
    await BleClient.initialize();
  }

  const startScan = async () => {
    await BleClient.requestLEScan({
      services: ["1775244D-6B43-439B-877C-060F2D9BED07"],
      allowDuplicates: false,
    }, (event) => {
      console.log("BLE Scan Event", event);
    });
    /*

    const device = await BleClient.requestDevice({
      services: ["1775244D-6B43-439B-877C-060F2D9BED07"],
      optionalServices: ["1775244D-6B43-439B-877C-060F2D9BED07"],
      allowDuplicates: false
    });
    if (device) {
      await connectToDevice(device);
    }
      */
  }

  const connectToDevice = async (device: BleDevice) => {
    if (connectedDevice.value) {
      await BleClient.disconnect(device.deviceId);
    }
    await BleClient.connect(device.deviceId);
    connectedDevice.value = device;

    const services = await BleClient.getServices(device.deviceId);
    for (const service of services) {
      if (service.uuid.toLocaleUpperCase() != "1775244D-6B43-439B-877C-060F2D9BED07") {
        continue;
      }

      for (const characteristic of service.characteristics) {
        for (const descriptor of characteristic.descriptors) {
          if (descriptor.uuid.slice(4, 8) !== "2901") continue;
          const readVal = await BleClient.readDescriptor(device.deviceId, service.uuid, characteristic.uuid, descriptor.uuid);
          const foundName = new TextDecoder().decode(readVal).toLowerCase();
          connectedDeviceServiceMap.value.set(foundName, characteristic);
        }
      }
    }
  }

  const sendData = async (data: Uint8Array, endpoint: string) => {
    const characteristic = connectedDeviceServiceMap.value.get(endpoint);
    if (!characteristic) {
      return;
    }
    await BleClient.write(connectedDevice.value!.deviceId, "1775244D-6B43-439B-877C-060F2D9BED07".toLowerCase(), characteristic.uuid, new DataView(data.buffer, data.byteOffset, data.byteLength));
    const response = await BleClient.read(connectedDevice.value!.deviceId, "1775244D-6B43-439B-877C-060F2D9BED07".toLowerCase(), characteristic.uuid);
    return new Uint8Array(response.buffer, response.byteOffset, response.byteLength);
  }

  const establishSession = async (pop: string) => {
    await establishSessionHelper(pop)
    console.log("Session established successfully");
    sessionEstablished.value = true;
  }

  const establishSessionHelper = async (pop: string) => {
    sec1 = new Security1(pop, false);

    const processSession = async (response?: Uint8Array): Promise<boolean> => {
      const request = await sec1!.handleSession(response);
      if (!request) return true;

      const newResponse = await sendData(request, "prov-session");
      if (!newResponse) return false;

      return processSession(newResponse);
    };

    return processSession();
  }

  //MARK: KD Console Commands
  const runKDConsoleCommand = async (command: string) => {
    //add newline to command
    const commandWithNewline = command + "\n";

    //uint8array of command
    const commandUint8Array = new TextEncoder().encode(commandWithNewline);

    //split in chunks of max 512 bytes
    const chunkSize = 511;
    const chunks = [];
    for (let i = 0; i < commandUint8Array.length; i += chunkSize) {
      chunks.push(commandUint8Array.slice(i, i + chunkSize));
    }

    let response = new Uint8Array(0);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const isLastChunk = i === chunks.length - 1;
      const encryptedChunk = await sec1!.encryptData(chunk);
      const last_chunk_response = await sendData(encryptedChunk, "kd_console");
      const decryptedResponse = await sec1!.decryptData(last_chunk_response!);

      if (isLastChunk && last_chunk_response) {
        response = new Uint8Array([...response, ...decryptedResponse]);
      }
    }

    //if response is less than 512 bytes, return it
    if (response.length < 512) {
      if (response[response.length - 1] === 10) {
        response = response.slice(0, -1);
      }

      return new TextDecoder().decode(response);
    }

    //if response is 512 bytes, keep reading until we get a response less than 512 bytes
    while (true) {
      const dataSend = new Uint8Array(1);
      const last_chunk_response = await sendData(await sec1!.encryptData(dataSend), "kd_console");
      const decryptedResponse = await sec1!.decryptData(last_chunk_response!);
      if (last_chunk_response) {
        response = new Uint8Array([...response, ...decryptedResponse]);
        if (decryptedResponse.length < 512) {
          break;
        }
      }
    }

    //if response ends with \n, remove it
    if (response[response.length - 1] === 10) {
      response = response.slice(0, -1);
    }

    return new TextDecoder().decode(response);
  }

  const console_getCryptoStatus = async () => {
    const command = "get_crypto_status";
    const response = await runKDConsoleCommand(command);

    const parsed = JSON.parse(response);

    return parsed.status as KDCryptoStatus;
  }

  const console_getCSR = async () => {
    const command = "get_csr";
    const response = await runKDConsoleCommand(command);
    const parsed = JSON.parse(response);
    const csr = parsed.csr;
    const csrString = atob(csr);
    return csrString;
  }

  const console_getDSParams = async () => {
    const command = "get_ds_params";
    const response = await runKDConsoleCommand(command);
    const parsed = JSON.parse(response);

    return parsed as KD_DSParams;
  }

  const console_setDSParams = async (dsParams: KD_DSParams) => {
    const command = `set_ds_params ${JSON.stringify(dsParams)}`;
    await runKDConsoleCommand(command);
  }

  const console_setClaimToken = async (claimToken: string) => {
    const command = `set_claim_token ${claimToken}`;
    await runKDConsoleCommand(command);
  }

  //MARK: WiFi Provisioning
  const scanForAPs = async () => {
    scanningForAPs.value = true;
    discoveredAPs.value = [];

    await startAPScan();

    const scanStatus = await getScanStatus();

    if (scanStatus.count > 0) {
      let index = 0;
      while (scanStatus.count > index) {
        const scanResult = await getScanResult(4, index);
        for (const result of scanResult) {
          discoveredAPs.value.push(result);
        }
        index += 4;
      }
    }

    scanningForAPs.value = false;
    return discoveredAPs.value;
  }

  const startAPScan = async () => {
    const payload = createScanStartRequest(true, false, 0, 120);
    const encrypted = await sec1!.encryptData(payload);
    const response = await sendData(encrypted, "prov-scan");
    const decrypted = await sec1!.decryptData(response!);
    return parseScanStartResponse(decrypted);
  }

  const getScanStatus = async () => {
    const payload = createScanStatusRequest();
    const encrypted = await sec1!.encryptData(payload);
    const response = await sendData(encrypted, "prov-scan");
    const decrypted = await sec1!.decryptData(response!);
    return parseScanStatusResponse(decrypted);
  }

  const getScanResult = async (n: number, start: number) => {
    const payload = createScanResultRequest(n, start);
    const encrypted = await sec1!.encryptData(payload);
    const response = await sendData(encrypted, "prov-scan");
    const decrypted = await sec1!.decryptData(response!);
    return parseScanResultResponse(decrypted);
  }

  const connectToAP = async (ap: WifiAP, password?: string) => {
    connectingToAP.value = ap;
    const payload = createSetConfigRequest(ap.ssid, password || "");
    const encrypted = await sec1!.encryptData(payload);
    const response = await sendData(encrypted, "prov-config");
    const decrypted = await sec1!.decryptData(response!);
    const resp = parseSetConfigResponse(decrypted);

    if (resp == 0) {
      console.log("WiFi Config Set Successfully");
      const applyPayload = createApplyConfigRequest();
      const applyEncrypted = await sec1!.encryptData(applyPayload);
      const applyResponse = await sendData(applyEncrypted, "prov-config");
      const applyDecrypted = await sec1!.decryptData(applyResponse!);
      const applyResp = parseApplyConfigResponse(applyDecrypted);

      if (applyResp == 0) {
        console.log("WiFi Config Applied Successfully");
        connCheckInterval = setInterval(checkWiFiConnection, 5000);
        checkWiFiConnection();
        return true;
      } else {
        console.error("Failed to apply WiFi config");
        return false;
      }
    }
  }

  const checkWiFiConnection = async () => {
    const payload = createGetStatusRequest();
    const encrypted = await sec1!.encryptData(payload);
    const response = await sendData(encrypted, "prov-config");
    const decrypted = await sec1!.decryptData(response!);
    const resp = parseGetStatusResponse(decrypted);

    if (resp.status) {
      clearInterval(connCheckInterval);
      connCheckInterval = undefined;
      connectedToAP.value = true;
      console.log("Connected to AP");
    }
  }

  return {
    initializeBluetooth, startScan, connectToDevice, establishSession, connectedDeviceServiceMap, console: {
      console_getCryptoStatus,
      console_getCSR,
      console_getDSParams,
      console_setDSParams,
      console_setClaimToken
    }, wifi: {
      scanForAPs, discoveredAPs, scanningForAPs, connectToAP, connectingToAP, connectedToAP
    }
  }
});
