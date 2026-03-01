/**
 * HahaHome API 客户端 - 统一 HTTP 请求封装
 *
 * @developer 光波 (a@ggbo.com)
 * @copyright Copyright (c) 2025 光波. All rights reserved.
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '';

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    let json;
    try {
      json = await response.json();
    } catch (e) {
      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status} - No JSON body`,
        };
      }
      return {
        success: false,
        error: 'Invalid JSON response from server',
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: json?.error || `HTTP ${response.status}`,
      };
    }

    return json as ApiResponse<T>;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '网络请求失败',
    };
  }
}

/** 后端是否可达（用于离线检测） */
export async function isApiAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/projects`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(500),
    });
    return response.ok;
  } catch {
    return false;
  }
}
