#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shlobj.h>
#include <shellapi.h>
#include <shlwapi.h>
#include <strsafe.h>
#include <string.h>
#include "resource.h"

/* Store the game at a stable per-user path, so the browser can keep its saves. */
static BOOL game_paths(WCHAR directory[MAX_PATH], WCHAR game[MAX_PATH]) {
    PWSTR local = NULL;
    if (FAILED(SHGetKnownFolderPath(&FOLDERID_LocalAppData, KF_FLAG_CREATE, NULL, &local))) {
        CoTaskMemFree(local);
        return FALSE;
    }
    HRESULT result = StringCchPrintfW(directory, MAX_PATH, L"%ls\\Minestart", local);
    CoTaskMemFree(local);
    if (FAILED(result)) return FALSE;
    if (!CreateDirectoryW(directory, NULL) && GetLastError() != ERROR_ALREADY_EXISTS) return FALSE;
    return SUCCEEDED(StringCchPrintfW(game, MAX_PATH, L"%ls\\Minestart.html", directory));
}

static BOOL already_current(PCWSTR path, const BYTE *payload, DWORD size) {
    HANDLE file = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_DELETE,
                              NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (file == INVALID_HANDLE_VALUE) return FALSE;
    LARGE_INTEGER length;
    BOOL equal = GetFileSizeEx(file, &length) && length.QuadPart == size;
    BYTE buffer[8192];
    for (DWORD offset = 0; equal && offset < size;) {
        DWORD read = 0;
        DWORD count = min((DWORD)sizeof(buffer), size - offset);
        equal = ReadFile(file, buffer, count, &read, NULL) && read == count &&
                memcmp(buffer, payload + offset, count) == 0;
        offset += count;
    }
    CloseHandle(file);
    return equal;
}

static int prepare_game(HINSTANCE instance, PCWSTR directory, PCWSTR game) {
    HRSRC resource = FindResourceW(instance, MAKEINTRESOURCEW(IDR_GAME), RT_RCDATA);
    if (!resource) return 11;
    DWORD size = SizeofResource(instance, resource);
    HGLOBAL loaded = LoadResource(instance, resource);
    const BYTE *payload = loaded ? LockResource(loaded) : NULL;
    if (!payload || size == 0) return 12;
    if (already_current(game, payload, size)) return 0;

    // Write then replace, so a failed write cannot leave a partially extracted game.
    WCHAR temp[MAX_PATH];
    if (!GetTempFileNameW(directory, L"MIN", 0, temp)) return 13;
    HANDLE file = CreateFileW(temp, GENERIC_WRITE, 0, NULL, TRUNCATE_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    int code = 14;
    if (file != INVALID_HANDLE_VALUE) {
        DWORD written = 0;
        BOOL ok = WriteFile(file, payload, size, &written, NULL) && written == size && FlushFileBuffers(file);
        CloseHandle(file);
        if (ok) code = MoveFileExW(temp, game, MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH) ? 0 : 15;
    }
    if (code != 0) DeleteFileW(temp);
    return code;
}

/* Use the Edge installation already on this PC for a window without browser tabs.
   No browser flags that change security settings, no download, and no elevation. */
static BOOL open_app_window(PCWSTR game) {
    WCHAR url[2048];
    DWORD length = ARRAYSIZE(url);
    if (FAILED(UrlCreateFromPathW(game, url, &length, 0))) return FALSE;
    const KNOWNFOLDERID *const folders[] = { &FOLDERID_ProgramFilesX86, &FOLDERID_ProgramFiles };
    for (unsigned i = 0; i < ARRAYSIZE(folders); i++) {
        PWSTR root = NULL;
        if (FAILED(SHGetKnownFolderPath(folders[i], 0, NULL, &root))) {
            CoTaskMemFree(root);
            continue;
        }
        WCHAR edge[MAX_PATH];
        HRESULT path = StringCchPrintfW(edge, ARRAYSIZE(edge), L"%ls\\Microsoft\\Edge\\Application\\msedge.exe", root);
        CoTaskMemFree(root);
        if (FAILED(path) || GetFileAttributesW(edge) == INVALID_FILE_ATTRIBUTES) continue;
        WCHAR command[ARRAYSIZE(edge) + ARRAYSIZE(url) + 32];
        if (FAILED(StringCchPrintfW(command, ARRAYSIZE(command), L"\"%ls\" --app=\"%ls\"", edge, url))) continue;
        STARTUPINFOW startup = { .cb = sizeof(startup) };
        PROCESS_INFORMATION process;
        if (CreateProcessW(edge, command, NULL, NULL, FALSE, 0, NULL, NULL, &startup, &process)) {
            CloseHandle(process.hThread);
            CloseHandle(process.hProcess);
            return TRUE;
        }
    }
    return FALSE;
}

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE previous, PWSTR command, int show) {
    (void)previous;
    (void)show;
    BOOL prepare_only = lstrcmpW(command, L"--prepare") == 0;
    HRESULT com = CoInitializeEx(NULL, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
    WCHAR directory[MAX_PATH], game[MAX_PATH];
    int code = game_paths(directory, game) ? prepare_game(instance, directory, game) : 10;
    if (code != 0) {
        if (!prepare_only) MessageBoxW(NULL, L"Impossible de préparer Minestart dans ton dossier utilisateur. Si ce poste est géré, demande conseil à l’administrateur.",
                                       L"Minestart", MB_OK | MB_ICONERROR);
    } else if (!prepare_only && !open_app_window(game) &&
               (INT_PTR)ShellExecuteW(NULL, L"open", game, NULL, directory, SW_SHOWNORMAL) <= 32) {
        code = 2;
        MessageBoxW(NULL, L"Impossible d’ouvrir le jeu. Utilise le fichier Minestart.html dans un navigateur si ton poste l’autorise.",
                    L"Minestart", MB_OK | MB_ICONERROR);
    }
    if (SUCCEEDED(com)) CoUninitialize();
    return code;
}
