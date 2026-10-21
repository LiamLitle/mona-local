"""Exécution des modèles ONNX sur ce PC (onnxruntime), réglée par hardware.plan()."""
import threading

import onnxruntime as ort

from . import registry


class Runtime:
    def __init__(self, plan):
        self.plan = plan
        self._sessions = {}
        self._lock = threading.Lock()

    def _options(self, parallel_share=1):
        o = ort.SessionOptions()
        o.intra_op_num_threads = max(1, self.plan["threads"] // parallel_share)
        o.inter_op_num_threads = 1
        o.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        if self.plan["mode"] == "eco":
            o.enable_cpu_mem_arena = False          # moins de mémoire gardée entre deux écrans
        o.log_severity_level = 3
        return o

    def session(self, name):
        """Session ONNX d'un modèle ('gaze_a', 'gaze_b', 'brain', 'detector'), créée à la première demande."""
        with self._lock:
            if name not in self._sessions:
                share = 2 if (self.plan["parallel_gaze"] and name.startswith("gaze")) else 1
                providers = [p for p in self.plan["providers"] if p in ort.get_available_providers()] or ["CPUExecutionProvider"]
                self._sessions[name] = ort.InferenceSession(str(registry.path(f"{name}.onnx")), self._options(share), providers=providers)
            return self._sessions[name]

    def warm_up(self, names, on_each=lambda n: None):
        for n in names:
            self.session(n)
            on_each(n)
