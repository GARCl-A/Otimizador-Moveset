"""Treina um modelo por CASO a partir de um único dataset_all.csv.

O app (aba Experimentos, botão "Gerar datasets (todos)") baixa `dataset_all.csv`
com uma coluna `case` identificando o cenário de cada amostra. Este script agrupa
por `case`, treina uma `ValueMLP` para cada um e escreve **um** `models_all.json`
no formato `{ caso: pesos }`, que o app carrega de volta em "Carregar models_all.json".

Uso:
  uv run --project neural python neural/train_all.py dataset_all.csv
  (ou: python neural/train_all.py caminho/para/dataset_all.csv --out pasta_saida)

Saídas na pasta --out (padrão: a do pacote neural/):
  - models_all.json            { caso: {arch, layers, inputMean, inputStd, activation} }
  - training_history_all.json  { caso: {train:[], val:[]} }  (curvas de loss)
  - <caso>_loss.png, <caso>_pred_vs_exato.png  (figuras por caso)
  - metrics_all.json           { caso: {mse, r2, n} }        (resumo p/ o artigo)
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

HERE = os.path.dirname(os.path.abspath(__file__))


# ValueMLP embutido (mesmo de model.py) para o script ser self-contained — assim dá
# para subir só este arquivo + o dataset no Colab, sem precisar do model.py junto.
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


def parse_hidden(s):
    return tuple(int(x) for x in s.split(",") if x.strip())


def treinar_caso(caso, X, y, args, out_dir):
    """Treina uma ValueMLP num único caso; devolve (pesos_dict, hist, metrics)."""
    in_dim = X.shape[1]
    X_tmp, X_test, y_tmp, y_test = train_test_split(X, y, test_size=0.15, random_state=args.seed)
    X_tr, X_val, y_tr, y_val = train_test_split(X_tmp, y_tmp, test_size=0.1765, random_state=args.seed)

    scaler = StandardScaler().fit(X_tr)
    Xtr, Xval, Xte = scaler.transform(X_tr), scaler.transform(X_val), scaler.transform(X_test)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    hidden = parse_hidden(args.hidden)
    torch.manual_seed(args.seed)
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

    for _ in range(args.epochs):
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
            best_val, best_state, bad = vloss, {k: v.clone() for k, v in model.state_dict().items()}, 0
        else:
            bad += 1
            if bad >= args.patience:
                break

    if best_state is not None:
        model.load_state_dict(best_state)

    model.eval()
    with torch.no_grad():
        pred_te = model(t(Xte)).cpu().numpy()
    mse = float(np.mean((pred_te - y_test) ** 2))
    ss_res = float(np.sum((y_test - pred_te) ** 2))
    ss_tot = float(np.sum((y_test - y_test.mean()) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
    print(f"  [{caso}] n={X.shape[0]}  MSE {mse:.3f}  R² {r2:.3f}")

    lin = [m for m in model.net if isinstance(m, nn.Linear)]
    pesos = {
        "arch": [in_dim, *hidden, 1],
        "layers": [
            {"W": l.weight.detach().cpu().numpy().tolist(), "b": l.bias.detach().cpu().numpy().tolist()}
            for l in lin
        ],
        "inputMean": scaler.mean_.astype(float).tolist(),
        "inputStd": scaler.scale_.astype(float).tolist(),
        "activation": "relu",
    }

    # figuras por caso
    plt.figure(figsize=(6, 4))
    plt.plot(hist["train"], label="treino")
    plt.plot(hist["val"], label="validação")
    plt.xlabel("época"); plt.ylabel("MSE"); plt.title(f"Loss — {caso}"); plt.legend(); plt.tight_layout()
    plt.savefig(os.path.join(out_dir, f"{caso}_loss.png"), dpi=120); plt.close()

    plt.figure(figsize=(5, 5))
    lim = [min(float(y_test.min()), float(pred_te.min())), max(float(y_test.max()), float(pred_te.max()))]
    plt.plot(lim, lim, "k--", lw=1)
    plt.scatter(y_test, pred_te, s=6, alpha=0.5)
    plt.xlabel("score exato"); plt.ylabel("score previsto"); plt.title(f"{caso} (R²={r2:.3f})"); plt.tight_layout()
    plt.savefig(os.path.join(out_dir, f"{caso}_pred_vs_exato.png"), dpi=120); plt.close()

    return pesos, hist, {"mse": mse, "r2": r2, "n": int(X.shape[0])}


def main():
    ap = argparse.ArgumentParser(description="Treina uma ValueMLP por caso (coluna 'case') do dataset_all.csv.")
    ap.add_argument("dataset", nargs="?", default="dataset_all.csv", help="CSV com colunas case,f0..fN,target")
    ap.add_argument("--hidden", default="128,64")
    ap.add_argument("--epochs", type=int, default=200)
    ap.add_argument("--batch", type=int, default=256)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--patience", type=int, default=20)
    ap.add_argument("--out", default=HERE)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    np.random.seed(args.seed)

    if not os.path.exists(args.dataset):
        print(f"[erro] não encontrado: {args.dataset}")
        print("Gere primeiro no app: aba Experimentos → 'Gerar datasets (todos)' (baixa dataset_all.csv).")
        raise SystemExit(1)

    df = pd.read_csv(args.dataset)
    if "case" not in df.columns:
        print("[erro] o CSV não tem coluna 'case'. Use o botão 'Gerar datasets (todos)' (batch), não o de caso único.")
        raise SystemExit(1)

    feat_cols = [c for c in df.columns if c not in ("case", "target")]
    os.makedirs(args.out, exist_ok=True)
    casos = list(df["case"].unique())
    print(f"{len(casos)} casos: {', '.join(map(str, casos))}")

    models, histories, metrics = {}, {}, {}
    for caso in casos:
        sub = df[df["case"] == caso]
        X = sub[feat_cols].to_numpy(np.float32)
        y = sub["target"].to_numpy(np.float32)
        pesos, hist, m = treinar_caso(str(caso), X, y, args, args.out)
        models[str(caso)] = pesos
        histories[str(caso)] = hist
        metrics[str(caso)] = m

    with open(os.path.join(args.out, "models_all.json"), "w", encoding="utf-8") as f:
        json.dump(models, f)
    with open(os.path.join(args.out, "training_history_all.json"), "w", encoding="utf-8") as f:
        json.dump(histories, f)
    with open(os.path.join(args.out, "metrics_all.json"), "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print(f"\nSalvos em {args.out}: models_all.json, training_history_all.json, metrics_all.json + figuras por caso.")
    print("Carregue models_all.json no app (aba Experimentos → 'Carregar models_all.json') e clique 'Rodar tudo'.")


if __name__ == "__main__":
    main()
