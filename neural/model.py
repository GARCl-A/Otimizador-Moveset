"""Função de valor construtiva (greedy-NN) — MLP em PyTorch.

A rede recebe o vetor de features (time parcial + candidato) gerado pelo app TS
(ver typescript/app/src/engine/nnFeatures.ts) e prevê o score de cobertura do time
COMPLETO resultante. É a parte da rede neural exigida em Python: o treino acontece
aqui; o app apenas carrega os pesos exportados (model_weights.json) para inferência.
"""

import torch
import torch.nn as nn


class ValueMLP(nn.Module):
    def __init__(self, in_dim, hidden=(128, 64)):
        super().__init__()
        layers = []
        prev = in_dim
        for h in hidden:
            layers.append(nn.Linear(prev, h))
            layers.append(nn.ReLU())
            prev = h
        layers.append(nn.Linear(prev, 1))
        self.net = nn.Sequential(*layers)

    def forward(self, x):
        return self.net(x).squeeze(-1)

    def linear_layers(self):
        """Camadas Linear na ordem do forward (para exportar W/b ao JSON)."""
        return [m for m in self.net if isinstance(m, nn.Linear)]
