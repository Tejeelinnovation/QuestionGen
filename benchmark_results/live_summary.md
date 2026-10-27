# Empirical Benchmark Live Summary: Local SLM Question Generation
> **Machine:** ASUS TUF Gaming F15 | NVIDIA GTX 1650 (4GB VRAM) | 8GB RAM
> **Progress:** 35 / 35 runs completed (100.0%)
> **Last Updated:** 2026-10-27 15:37:35

## Overall Model Leaderboard

| Model | Completed | JSON Success | Avg Speed (tok/s) | Avg Latency | Schema Score | Peak VRAM |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **qwen2.5:3b** | 7/7 | 100.0% | 47.4 t/s | 24.2s | 56.3% | 2139 MB |
| **phi3.5:latest** | 7/7 | 71.4% | 6.6 t/s | 140.9s | 42.9% | 2315 MB |
| **qwen2.5-coder:7b** | 7/7 | 85.7% | 3.8 t/s | 140.3s | 47.6% | 2315 MB |
| **llama3.2:3b** | 7/7 | 85.7% | 27.6 t/s | 37.3s | 57.1% | 2313 MB |
| **qwen2.5:7b** | 7/7 | 85.7% | 4.4 t/s | 183.2s | 42.9% | 2313 MB |

## Per-Dataset Detailed Execution Log

| Model | Subject | Status | JSON | Tokens | Speed | Latency | Schema Score |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| qwen2.5:3b | Computer Science (Python) | ✅ Pass | ✅ | 599 | 48.49 t/s | 35.13s | 94.4% |
| qwen2.5:3b | Chemistry | ✅ Pass | ✅ | 961 | 46.63 t/s | 33.39s | 100.0% |
| qwen2.5:3b | Accountancy / Economics | ✅ Pass | ✅ | 595 | 47.89 t/s | 22.91s | 100.0% |
| qwen2.5:3b | Sociology | ✅ Pass | ✅ | 724 | 45.02 t/s | 26.66s | 100.0% |
| qwen2.5:3b | Hindi Literature | ✅ Pass | ✅ | 152 | 47.11 t/s | 17.36s | 0.0% |
| qwen2.5:3b | Biology (Hindi) | ✅ Pass | ✅ | 154 | 47.99 t/s | 17.24s | 0.0% |
| qwen2.5:3b | Sanskrit (Shemushi) | ✅ Pass | ✅ | 132 | 48.59 t/s | 16.75s | 0.0% |
| phi3.5:latest | Computer Science (Python) | ✅ Pass | ✅ | 742 | 6.62 t/s | 147.67s | 100.0% |
| phi3.5:latest | Chemistry | ❌ Fail | ❌ | 1046 | 5.27 t/s | 221.96s | 0.0% |
| phi3.5:latest | Accountancy / Economics | ✅ Pass | ✅ | 1174 | 5.44 t/s | 242.17s | 100.0% |
| phi3.5:latest | Sociology | ✅ Pass | ✅ | 932 | 6.8 t/s | 153.87s | 100.0% |
| phi3.5:latest | Hindi Literature | ✅ Pass | ✅ | 161 | 7.76 t/s | 40.76s | 0.0% |
| phi3.5:latest | Biology (Hindi) | ✅ Pass | ✅ | 461 | 7.35 t/s | 81.84s | 0.0% |
| phi3.5:latest | Sanskrit (Shemushi) | ❌ Fail | ❌ | 562 | 7.23 t/s | 97.73s | 0.0% |
| qwen2.5-coder:7b | Computer Science (Python) | ✅ Pass | ✅ | 642 | 4.46 t/s | 192.93s | 100.0% |
| qwen2.5-coder:7b | Chemistry | ✅ Pass | ✅ | 917 | 4.21 t/s | 251.89s | 100.0% |
| qwen2.5-coder:7b | Accountancy / Economics | ✅ Pass | ✅ | 603 | 4.54 t/s | 155.64s | 100.0% |
| qwen2.5-coder:7b | Sociology | ❌ Fail | ❌ | 0 | 0.0 t/s | 0.0s | 0.0% |
| qwen2.5-coder:7b | Hindi Literature | ✅ Pass | ✅ | 471 | 4.51 t/s | 135.34s | 0.0% |
| qwen2.5-coder:7b | Biology (Hindi) | ✅ Pass | ✅ | 357 | 4.32 t/s | 112.57s | 0.0% |
| qwen2.5-coder:7b | Sanskrit (Shemushi) | ✅ Pass | ✅ | 488 | 4.51 t/s | 134.07s | 33.3% |
| llama3.2:3b | Computer Science (Python) | ✅ Pass | ✅ | 534 | 25.04 t/s | 50.59s | 100.0% |
| llama3.2:3b | Chemistry | ✅ Pass | ✅ | 835 | 21.74 t/s | 55.42s | 100.0% |
| llama3.2:3b | Accountancy / Economics | ✅ Pass | ✅ | 584 | 24.27 t/s | 35.5s | 100.0% |
| llama3.2:3b | Sociology | ✅ Pass | ✅ | 942 | 23.18 t/s | 52.12s | 100.0% |
| llama3.2:3b | Hindi Literature | ✅ Pass | ✅ | 356 | 24.35 t/s | 29.85s | 0.0% |
| llama3.2:3b | Biology (Hindi) | ❌ Fail | ❌ | 2 | 49.75 t/s | 15.23s | 0.0% |
| llama3.2:3b | Sanskrit (Shemushi) | ✅ Pass | ✅ | 176 | 24.82 t/s | 22.24s | 0.0% |
| qwen2.5:7b | Computer Science (Python) | ✅ Pass | ✅ | 610 | 4.44 t/s | 194.14s | 100.0% |
| qwen2.5:7b | Chemistry | ❌ Fail | ❌ | 1015 | 4.18 t/s | 276.98s | 0.0% |
| qwen2.5:7b | Accountancy / Economics | ✅ Pass | ✅ | 719 | 4.48 t/s | 183.23s | 100.0% |
| qwen2.5:7b | Sociology | ✅ Pass | ✅ | 632 | 4.48 t/s | 164.14s | 100.0% |
| qwen2.5:7b | Hindi Literature | ✅ Pass | ✅ | 304 | 4.49 t/s | 98.28s | 0.0% |
| qwen2.5:7b | Biology (Hindi) | ✅ Pass | ✅ | 217 | 4.52 t/s | 78.65s | 0.0% |
| qwen2.5:7b | Sanskrit (Shemushi) | ✅ Pass | ✅ | 1107 | 4.32 t/s | 287.05s | 0.0% |