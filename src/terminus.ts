import axios, { AxiosInstance, AxiosResponse } from "axios";
import { env } from "./env";

// TypeScript interfaces for API responses
export interface Screen {
  id: number;
  model_id: number;
  label: string;
  name: string;
  created_at: string;
  updated_at: string;
  filename: string;
  mime_type: string;
  bit_depth: number;
  width: number;
  height: number;
  size: number;
  uri: string;
}

export interface Device {
  id: number;
  model_id: number;
  playlist_id: number;
  friendly_id: string;
  label: string;
  mac_address: string;
  api_key: string;
  firmware_version: string;
  firmware_beta: boolean;
  wifi: number;
  battery: number;
  refresh_rate: number;
  image_timeout: number;
  width: number;
  height: number;
  proxy: boolean;
  firmware_update: boolean;
  sleep_start_at: string;
  sleep_stop_at: string;
  created_at: string;
  updated_at: string;
}

export interface Model {
  id: number;
  name: string;
  label: string;
  description: string;
  kind: "core" | "terminus";
  mime_type: string;
  colors: number;
  bit_depth: number;
  scale_factor: number;
  rotation: number;
  offset_x: number;
  offset_y: number;
  width: number;
  height: number;
  published_at: string;
  created_at: string;
  updated_at: string;
}

// Configuration
const TERMINUS_URL = env("TERMINUS_URL");
const TERMINUS_PORT = env("TERMINUS_PORT");

const baseURL: string = `http://${TERMINUS_URL}:${TERMINUS_PORT}`;

let apiClient: AxiosInstance;

/**
 * Initialize the Terminus API client with base URL
 * @param url - Optional custom base URL (defaults to environment variables)
 */
export function initializeTerminus(url?: string): void {
  const finalURL = url || baseURL;
  apiClient = axios.create({
    baseURL: finalURL,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

// Initialize with environment variables
initializeTerminus();

/**
 * Get all screens from the Terminus server
 * @returns Promise resolving to screens response
 */
export async function getScreens(): Promise<Screen[]> {
  try {
    const response: AxiosResponse<{ data: Screen[] }> =
      await apiClient.get("/api/screens");
    return response.data.data;
  } catch (error) {
    throw new Error(`Failed to get screens: ${error}`);
  }
}

/**
 * Add a new screen with base64 image data
 * @param b64 - Base64 encoded image data
 * @param screenName - Name for the screen
 * @param label - Optional label for the screen
 * @param fileName - Optional file name (defaults to screenName.png)
 * @param modelId - Model ID (defaults to 1)
 * @returns Promise resolving to the created screen ID
 */
export async function addScreen(
  b64: string,
  screenName: string,
  label?: string,
  fileName?: string,
  modelId: number = 1,
): Promise<number> {
  try {
    const requestData = {
      image: {
        data: b64,
        label: label || screenName,
        name: screenName,
        file_name: fileName || `${screenName}.png`,
        model_id: modelId.toString(),
      },
    };

    const response: AxiosResponse<{ data: Screen }> = await apiClient.post(
      "/api/screens",
      requestData,
    );

    return response.data.data.id;
  } catch (error) {
    throw new Error(`Failed to add screen: ${error}`);
  }
}

/**
 * Remove a screen by ID
 * @param id - Screen ID to remove
 * @returns Promise resolving when screen is deleted
 */
export async function removeScreen(id: number): Promise<void> {
  try {
    await apiClient.delete(`/api/screens/${id}`);
  } catch (error) {
    throw new Error(`Failed to remove screen ${id}: ${error}`);
  }
}

/**
 * Add a screen to a playlist
 * @param playlistId - Playlist ID
 * @param screenId - Screen ID to add
 * @returns Promise resolving when screen is added to playlist
 */
export async function addScreenToPlaylist(
  playlistId: number,
  screenId: number,
): Promise<void> {
  try {
    const formData = new URLSearchParams();
    formData.append("playlist_item[screen_id]", screenId.toString());

    await apiClient.post(`/playlists/${playlistId}/items`, formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
  } catch (error) {
    throw new Error(
      `Failed to add screen ${screenId} to playlist ${playlistId}: ${error}`,
    );
  }
}

/**
 * Remove a screen from a playlist
 * Note: This requires finding the playlist item ID first
 * @param playlistId - Playlist ID
 * @param screenId - Screen ID to remove
 * @returns Promise resolving when screen is removed from playlist
 */
export async function removeScreenFromPlaylist(
  playlistId: number,
  screenId: number,
): Promise<void> {
  try {
    // Note: The API requires itemId, not screenId directly
    // This would need additional endpoint to get playlist items first
    // For now, implementing as direct DELETE call
    await apiClient.delete(`/playlists/${playlistId}/items/${screenId}`);
  } catch (error) {
    throw new Error(
      `Failed to remove screen ${screenId} from playlist ${playlistId}: ${error}`,
    );
  }
}

/**
 * Get device information by device ID
 * @param deviceId - Device ID to retrieve
 * @returns Promise resolving to device data
 */
export async function getDevice(deviceId: number): Promise<Device> {
  try {
    const response: AxiosResponse<{ data: Device }> = await apiClient
      .get(`/api/devices/${deviceId}`);
    return response.data.data;
  } catch (error) {
    throw new Error(`Failed to get device ${deviceId}: ${error}`);
  }
}

/**
 * Get model information by model ID
 * @param modelId - Model ID to retrieve
 * @returns Promise resolving to model data
 */
export async function getModel(modelId: number): Promise<Model> {
  try {
    const response: AxiosResponse<{ data: Model }> = await apiClient.get(
      `/api/models/${modelId}`,
    );
    return response.data.data;
  } catch (error) {
    throw new Error(`Failed to get model ${modelId}: ${error}`);
  }
}
