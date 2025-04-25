import { defineStore } from "pinia";
import { BleCharacteristic, BleClient, BleDevice } from "@capacitor-community/bluetooth-le";
import { ref } from "vue";
import { Security1 } from "./security/security_1";

export const useBleProvStore = defineStore("ble_prov", () => {
  const connectedDevice = ref<BleDevice | undefined>(undefined);
  const connectedDeviceServiceMap = ref<Map<string, BleCharacteristic>>(new Map());
  const sessionEstablished = ref(false);

  let sec1: Security1 | undefined = undefined;

  const initializeBluetooth = async () => {
    await BleClient.initialize();
  }

  const startScan = async () => {
    const device = await BleClient.requestDevice({
      services: ["1775244D-6B43-439B-877C-060F2D9BED07"],
      optionalServices: ["1775244D-6B43-439B-877C-060F2D9BED07"],
      allowDuplicates: false
    });
    if (device) {
      await connectToDevice(device);
    }
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

  const establishSession = async (pop: string) => {
    await establishSessionHelper(pop)
    console.log("Session established successfully");
    sessionEstablished.value = true;
  }

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
      console.log("Final response", response);
      return response;
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

    console.log("Final response", response);

    return response;
  }

  return { initializeBluetooth, startScan, connectToDevice, establishSession, connectedDeviceServiceMap, runKDConsoleCommand }
});
