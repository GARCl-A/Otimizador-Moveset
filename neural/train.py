"""Treina a função de valor greedy-NN sobre o dataset exportado pelo app.

Pipeline:
  1. No app (aba Experimentos), clique "Gerar dataset (CSV)" -> baixa dataset.csv.
  2. python neural/train.py dataset.csv
  3. Carregue o model_weights.json gerado na aba Experimentos (ou no Otimizador,
     método Greedy-NN).

Saídas (na pasta --out, padrão a do próprio pacote neural/):
  - model_weights.json     pesos no schema esperado por typescript/.../mlp.ts
  - training_history.json  loss de treino/val por época (curva de loss no app)
  - loss_curve.png         curva de loss (matplotlib)
  - pred_vs_exato.png      dispersão previsto-vs-exato no conjunto de teste
"""

import argparse
import json
import os

import numpy as np
import pandas as pd
import torch
from torch import nn
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from model import ValueMLP  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))


def parse_hidden(s):
    return tuple(int(x) for x in s.split(",") if x.strip())


def main():
    ap = argparse.ArgumentParser(description="Treina a rede de valor greedy-NN (PyTorch).")
    ap.add_argument("dataset", nargs="?", default="dataset.csv", help="CSV com colunas f0..fN,target")
    ap.add_argument("--hidden", default="128,64", help="camadas ocultas, ex.: 128,64")
    ap.add_argument("--epochs", type=int, default=200)
    ap.add_argument("--batch", type=int, default=256)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--patience", type=int, default=20, help="early stopping")
    ap.add_argument("--out", default=HERE, help="pasta de saída")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)

    if not os.path.exists(args.dataset):
        print(f"[erro] dataset não encontrado: {args.dataset}\n")
        print("Gere-o primeiro no app: aba Experimentos -> 'Gerar dataset (CSV)'.")
        print("O navegador salva em Downloads. Aponte o train.py para lá, ex.:")
        print(r'  uv run --project neural python neural/train.py "%USERPROFILE%\Downloads\dataset.csv"')
        raise SystemExit(1)

    df = pd.read_csv(args.dataset)
    feat_cols = [c for c in df.columns if c != "target"]
    X = df[feat_cols].to_numpy(np.float32)
    y = df["target"].to_numpy(np.float32)
    in_dim = X.shape[1]
    print(f"Dataset: {X.shape[0]} amostras, {in_dim} features.")

    # split 70/15/15 (treino/val/teste)
    X_tmp, X_test, y_tmp, y_test = train_test_split(X, y, test_size=0.15, random_state=args.seed)
    X_tr, X_val, y_tr, y_val = train_test_split(X_tmp, y_tmp, test_size=0.1765, random_state=args.seed)

    scaler = StandardScaler().fit(X_tr)
    Xtr, Xval, Xte = scaler.transform(X_tr), scaler.transform(X_val), scaler.transform(X_test)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    hidden = parse_hidden(args.hidden)
    model = ValueMLP(in_dim, hidden).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr)
    lossf = nn.MSELoss()

    def t(a):
        return torch.tensor(a, dtype=torch.float32, device=device)

    Xtr_t, ytr_t = t(Xtr), t(y_tr)
    Xval_t, yval_t = t(Xval), t(y_val)
    n = Xtr_t.shape[0]

    hist = {"train": [], "val": []}
    best_val, best_state, bad = float("inf"), None, 0

    for epoch in range(args.epochs):
        model.train()
        perm = torch.randperm(n, device=device)
        running = 0.0
        for i in range(0, n, args.batch):
            idx = perm[i : i + args.batch]
            opt.zero_grad()
            loss = lossf(model(Xtr_t[idx]), ytr_t[idx])
            loss.backward()
            opt.step()
            running += loss.item() * len(idx)
        tr = running / n
        model.eval()
        with torch.no_grad():
            vloss = lossf(model(Xval_t), yval_t).item()
        hist["train"].append(tr)
        hist["val"].append(vloss)

        if vloss < best_val - 1e-6:
            best_val = vloss
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
            bad = 0
        else:
            bad += 1
            if bad >= args.patience:
                print(f"Early stopping na época {epoch} (val {vloss:.4f}).")
                break
        if epoch % 10 == 0:
            print(f"época {epoch:3d}  train {tr:.4f}  val {vloss:.4f}")

    if best_state is not None:
        model.load_state_dict(best_state)

    model.eval()
    with torch.no_grad():
        pred_te = model(t(Xte)).cpu().numpy()
    mse = float(np.mean((pred_te - y_test) ** 2))
    ss_res = float(np.sum((y_test - pred_te) ** 2))
    ss_tot = float(np.sum((y_test - y_test.mean()) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
    print(f"TESTE: MSE {mse:.4f}  R² {r2:.4f}")

    os.makedirs(args.out, exist_ok=True)
    lin = model.linear_layers()
    weights = {
        "arch": [in_dim, *hidden, 1],
        "layers": [
            {"W": l.weight.detach().cpu().numpy().tolist(), "b": l.bias.detach().cpu().numpy().tolist()}
            for l in lin
        ],
        "inputMean": scaler.mean_.astype(float).tolist(),
        "inputStd": scaler.scale_.astype(float).tolist(),
        "activation": "relu",
    }
    with open(os.path.join(args.out, "model_weights.json"), "w", encoding="utf-8") as f:
        json.dump(weights, f)
    with open(os.path.join(args.out, "training_history.json"), "w", encoding="utf-8") as f:
        json.dump(hist, f)

    plt.figure(figsize=(6, 4))
    plt.plot(hist["train"], label="treino")
    plt.plot(hist["val"], label="validação")
    plt.xlabel("época")
    plt.ylabel("MSE")
    plt.title("Curva de loss")
    plt.legend()
    plt.tight_layout()
    plt.savefig(os.path.join(args.out, "loss_curve.png"), dpi=120)
    plt.close()

    plt.figure(figsize=(5, 5))
    lim = [min(float(y_test.min()), float(pred_te.min())), max(float(y_test.max()), float(pred_te.max()))]
    plt.plot(lim, lim, "k--", lw=1)
    plt.scatter(y_test, pred_te, s=6, alpha=0.5)
    plt.xlabel("score exato")
    plt.ylabel("score previsto")
    plt.title(f"Previsto vs Exato (R²={r2:.3f})")
    plt.tight_layout()
    plt.savefig(os.path.join(args.out, "pred_vs_exato.png"), dpi=120)
    plt.close()

    print(f"Salvos em {args.out}: model_weights.json, training_history.json, loss_curve.png, pred_vs_exato.png")


if __name__ == "__main__":
    main()
