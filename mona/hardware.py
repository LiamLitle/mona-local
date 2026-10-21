"""Lit les capacités du PC, puis règle Mona en conséquence (threads, GPU, nombre d'écrans, mode).

Objectif : profiter du PC sans le saturer. Mona laisse toujours un quart des cœurs libres
pour que la machine reste utilisable pendant l'analyse.
"""
import ctypes
import os
import platform
import subprocess
import sys


def _ram_gb():
    try:
        import psutil
        m = psutil.virtual_memory()
        return m.total / 2**30, m.available / 2**30
    except Exception:
        pass
    try:
        if sys.platform == "win32":
            class S(ctypes.Structure):
                _fields_ = [("l", ctypes.c_ulong), ("p", ctypes.c_ulong), ("t", ctypes.c_ulonglong), ("a", ctypes.c_ulonglong),
                            ("pf", ctypes.c_ulonglong), ("paf", ctypes.c_ulonglong), ("v", ctypes.c_ulonglong), ("av", ctypes.c_ulonglong),
                            ("e", ctypes.c_ulonglong)]
            s = S(); s.l = ctypes.sizeof(S)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(s))
            return s.t / 2**30, s.a / 2**30
        if sys.platform.startswith("linux"):
            kv = {l.split(":")[0]: int(l.split()[1]) for l in open("/proc/meminfo") if ":" in l}
            return kv["MemTotal"] / 2**20, kv.get("MemAvailable", kv["MemFree"]) / 2**20
        out = subprocess.run(["sysctl", "-n", "hw.memsize"], capture_output=True, text=True, timeout=3).stdout.strip()
        return int(out) / 2**30, int(out) / 2**30 / 2
    except Exception:
        return 8.0, 4.0


def _cpu_name():
    try:
        if sys.platform == "win32":
            import winreg
            k = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
            return winreg.QueryValueEx(k, "ProcessorNameString")[0].strip()
        if sys.platform.startswith("linux"):
            for l in open("/proc/cpuinfo"):
                if l.startswith("model name"):
                    return l.split(":", 1)[1].strip()
        if sys.platform == "darwin":
            return subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"], capture_output=True, text=True, timeout=3).stdout.strip()
    except Exception:
        pass
    return platform.processor() or "processeur inconnu"


def _providers():
    try:
        import onnxruntime as ort
        return ort.get_available_providers()
    except Exception:
        return ["CPUExecutionProvider"]


def profile():
    """Photographie du PC : système, processeur, mémoire, accélération disponible pour les modèles."""
    logical = os.cpu_count() or 2
    try:
        import psutil
        physical = psutil.cpu_count(logical=False) or max(1, logical // 2)
    except Exception:
        physical = max(1, logical // 2)
    total, free = _ram_gb()
    prov = _providers()
    gpu = next((n for n, p in (("CUDA (NVIDIA)", "CUDAExecutionProvider"), ("DirectML (carte graphique Windows)", "DmlExecutionProvider"),
                               ("CoreML (Apple)", "CoreMLExecutionProvider"), ("ROCm (AMD)", "ROCMExecutionProvider")) if p in prov), None)
    return {"os": f"{platform.system()} {platform.release()}", "cpu": _cpu_name(), "cores_logical": logical, "cores_physical": physical,
            "ram_gb": round(total, 1), "ram_free_gb": round(free, 1), "providers": prov, "gpu": gpu, "python": platform.python_version()}


def plan(p, mode="auto"):
    """Réglages adaptés au PC. mode : auto, eco, standard ou turbo (force le choix)."""
    cores, ram = p["cores_logical"], p["ram_gb"]
    if mode == "auto":
        mode = "eco" if (cores < 4 or ram < 6) else "turbo" if (cores >= 8 and ram >= 12) else "standard"
    # on laisse un quart des cœurs au reste du PC
    budget = max(1, int(cores * 0.75))
    prov = ["CPUExecutionProvider"]
    notes = []
    if mode == "eco":
        threads, parallel, max_screens = max(1, budget // 2), False, 6
        notes.append("PC modeste : calcul en douceur, 6 écrans au plus par page.")
    elif mode == "standard":
        threads, parallel, max_screens = min(budget, 6), False, 12
    else:
        threads, parallel, max_screens = min(budget, 12), True, 12
        notes.append("Les deux modèles de regard tournent en parallèle.")
    if mode != "eco" and p["gpu"]:
        pref = {"CUDA (NVIDIA)": "CUDAExecutionProvider", "DirectML (carte graphique Windows)": "DmlExecutionProvider",
                "CoreML (Apple)": "CoreMLExecutionProvider", "ROCm (AMD)": "ROCMExecutionProvider"}[p["gpu"]]
        prov = [pref, "CPUExecutionProvider"]
        notes.append(f"Accélération {p['gpu']} utilisée.")
    elif mode != "eco" and sys.platform == "win32":
        notes.append("Astuce : « pip install onnxruntime-directml » active la carte graphique pour aller plus vite.")
    if p["ram_free_gb"] < 2:
        notes.append("Peu de mémoire libre : ferme quelques applications pour de meilleurs résultats.")
        max_screens = min(max_screens, 6)
    return {"mode": mode, "threads": threads, "parallel_gaze": parallel, "max_screens": max_screens, "providers": prov, "notes": notes}
