const paper = (name, version, code, fields) => ({
  name, url: "https://arxiv.org/html/" + version, code, fields,
});

export const comparisons = [
  {
    key: "efficiency",
    title: ["视觉语言模型推测解码", "Speculative decoding for VLMs"],
    note: [
      "三篇都在加速视觉语言模型。先核对加速比的分母、模型、温度和并发；端到端延迟与解码吞吐衡量的是不同环节。",
      "These papers all accelerate vision-language models. Check the speedup denominator, model, temperature and concurrency. End-to-end latency and decoding throughput measure different parts of the workload.",
    ],
    papers: [
      paper("MMFlash", "2611.18482v1", "https://github.com/fscdc/MMFlash", {
        method: ["用图像条件与视觉词元加权训练块式草稿模型。", "Trains a block drafter with visual conditioning and visual-token weighting.", "§4", "S4.SS2"],
        dataset: ["例如 ChartQA、CharXiv、MMStar、MMBench、DynaMath、MathVista、MathVerse。", "Includes ChartQA, CharXiv, MMStar, MMBench, DynaMath, MathVista and MathVerse.", "Table 1", "S4.T1"],
        baseline: ["加速比以自回归解码为参照；另与 MTP、EAGLE-3、DFlash 比较。", "Speedup is measured against autoregressive decoding. MTP, EAGLE-3 and DFlash are also compared.", "§5.1 / Table 1", "S5.SS1"],
        result: ["Qwen3.5-9B、温度 0、块长 16，表中平均解码加速 3.05×；DFlash 同列为 2.75×。", "For Qwen3.5-9B at temperature 0 with block size 16, the table reports a mean decoding speedup of 3.05×, versus 2.75× for DFlash.", "Table 1", "S4.T1"],
        setup: ["目标模型为 Qwen3.5-4B 与 9B，报告温度 0 和 1。训练用 8 张 NVIDIA H100。", "Targets Qwen3.5-4B and 9B at temperatures 0 and 1. Training used eight NVIDIA H100 GPUs.", "§5.1 / Appendix D", "S5.SS1"],
      }),
      paper("SpecVLM", "2509.11815v1", "https://github.com/haiduo/SpecVLM", {
        method: ["弹性视觉词元压缩与在线 logits 蒸馏。", "Combines elastic visual token compression and online logit distillation.", "§3", "S3"],
        dataset: ["LLaVA-Wild、MMBench、ScienceQA、SEED-Bench、TextVQA、VQAv2 与 MMMU-V1。", "LLaVA-Wild, MMBench, ScienceQA, SEED-Bench, TextVQA, VQAv2 and MMMU-V1.", "Tables 1–2", "S4.T1"],
        baseline: ["论文与采用 EAGLE-2 风格推测解码的 EagleVLM 比较。", "The paper compares with EagleVLM, an EAGLE-2-style speculative decoding baseline.", "Table 3", "S5.T3"],
        result: ["在 MMMU-V1 上，LLaVA-1.5-7B 平均加速 1.89×，EagleVLM 为 1.82×（温度 0，训练 1 轮）。", "On MMMU-V1 with LLaVA-1.5-7B, average speedup is 1.89×, versus 1.82× for EagleVLM (temperature 0, one epoch).", "Table 2", "S4.T2"],
        setup: ["LLaVA 1.5/1.6 的多种规模；单卡 AMD MI250-64G 或 NVIDIA A100-80G 测延迟，表 2 用 MI250。", "Multiple LLaVA 1.5/1.6 sizes. Latency was measured on one AMD MI250-64G or NVIDIA A100-80G. Table 2 uses MI250.", "§4.1 / Table 2", "S4.SS1"],
      }),
      paper("Uni-LaSpec", "2611.01617v1", null, {
        method: ["引入视觉草稿模型，并按服务负载切换验证结构。", "Adds a visual drafter and chooses the verification structure according to serving load.", "§III", "S3"],
        dataset: ["例如 OmniDocBench、OCRBench-v2、CharXiv、TextVQA、MMMU-Pro；多模态共 10 个基准。", "Ten multimodal benchmarks including OmniDocBench, OCRBench-v2, CharXiv, TextVQA and MMMU-Pro.", "§IV-A", "S4.SS1"],
        baseline: ["吞吐以自回归解码为参照，另比较固定验证策略及 DFlash 草稿模型。", "Throughput is relative to autoregressive decoding. Fixed verification strategies and DFlash drafters are also compared.", "§IV-A", "S4.SS1"],
        result: ["贪心解码且并发为 1 时，多模态吞吐最高为自回归解码的 3.24×。", "With greedy decoding at concurrency one, multimodal throughput reaches up to 3.24× autoregressive decoding.", "§IV-C1", "S4.SS3.SSS1"],
        setup: ["主验证策略实验在 RTX A6000 上运行；并发实验另在 RTX 5090 和 A800 复测。", "Main verification experiments use RTX A6000. The concurrency study was repeated on RTX 5090 and A800.", "§IV-A / Table XI", "S4.SS1"],
      }),
    ],
  },
  {
    key: "vision",
    title: ["前馈 3D 高斯泼溅", "Feed-forward 3D Gaussian splatting"],
    note: [
      "两篇都做新视角合成。重点比较相机位姿是否作为输入、输入图像数量、训练与测试是否跨域。",
      "Both papers study novel-view synthesis. Compare the camera-pose assumptions, number of input views and whether evaluation crosses dataset domains.",
    ],
    papers: [
      paper("SplatAnything", "2611.08264v2", "https://github.com/zju3dv/InfiniSplat", {
        method: ["用高斯间距归一化处理跨物理尺度的 3D 高斯预测，评估有位姿和无位姿两种设定。", "Uses Gaussian spacing normalization across scene scales and evaluates both posed and pose-free settings.", "§3", "S3"],
        dataset: ["ScanNet、NRGBD、DL3DV、Tanks and Temples、Mip-NeRF 360、ETH3D、DTU。", "ScanNet, NRGBD, DL3DV, Tanks and Temples, Mip-NeRF 360, ETH3D and DTU.", "§4.1", "S4.SS1"],
        baseline: ["有位姿设定包括 DepthSplat、TokenGS、tttLRM、ReSplat；单视图另比较 SHARP 与 InfiniSplat。", "Posed comparisons include DepthSplat, TokenGS, tttLRM and ReSplat. Single-view experiments also compare SHARP and InfiniSplat.", "§4.1", "S4.SS1"],
        result: ["在 DL3DV 的有位姿设定下，DISTS 为 0.215、LPIPS 为 0.148（4、8、16、32、64 视图平均）。", "On DL3DV in the posed setting, DISTS is 0.215 and LPIPS is 0.148, averaged over 4, 8, 16, 32 and 64 views.", "Table 1", "S4.T1"],
        setup: ["基准分辨率约 480p 至 1K，输入与目标视图重叠为 0.2–0.6；训练使用 64 张 NVIDIA H20。", "Benchmark resolution is about 480p to 1K with input–target overlap of 0.2–0.6. Training used 64 NVIDIA H20 GPUs.", "§3.5 / §4.1", "S3.SS5"],
      }),
      paper("MVSplat", "2403.14627v2", "https://github.com/donydchen/mvsplat", {
        method: ["从稀疏输入视图构建代价体，再预测渲染所用的 3D 高斯。", "Builds a cost volume from sparse views and predicts 3D Gaussians for rendering.", "§3", "S3"],
        dataset: ["RealEstate10K 与 ACID；各自在对应数据集的不同场景上训练与测试。", "RealEstate10K and ACID, with separate training and test scenes within each dataset.", "§4.2", "S4.SS2"],
        baseline: ["pixelNeRF、GPNR、AttnRend、MuRF、pixelSplat。", "pixelNeRF, GPNR, AttnRend, MuRF and pixelSplat.", "Table 1", "S4.T1"],
        result: ["RealEstate10K 上为 26.39 PSNR、0.869 SSIM、0.128 LPIPS；同表列出 pixelSplat 的 25.89、0.858、0.142。", "RealEstate10K scores are 26.39 PSNR, 0.869 SSIM and 0.128 LPIPS. The same table lists pixelSplat at 25.89, 0.858 and 0.142.", "Table 1", "S4.T1"],
        setup: ["两张有位姿的参考视图。训练使用单张 NVIDIA A100，批量大小为 14。", "Two posed reference views. Training used one NVIDIA A100 with batch size 14.", "§4.1 / Appendix 0.C", "Pt0.A3"],
      }),
    ],
  },
  {
    key: "embodied",
    title: ["视觉语言动作模型的速度与成功率", "Speed and success in vision-language-action models"],
    note: [
      "两篇都报告 LIBERO，但使用不同任务与基座。HDH 的查询时间含仿真开销，OpenVLA-OFT 表中的模型延迟来自 100 次 GPU 查询。",
      "Both papers report LIBERO results with different tasks and base models. HDH query timing includes simulator overhead. The OpenVLA-OFT table measures model latency over 100 GPU queries.",
    ],
    papers: [
      paper("HDH", "2611.14834v1", null, {
        method: ["保持 π0.5 策略冻结，用轻量验证器选动作。", "Keeps the π0.5 policy frozen and selects actions with a compact verifier.", "§III", "S3"],
        dataset: ["LIBERO-10 的四项仿真任务与三项真实机器人操作任务。", "Four simulated LIBERO-10 tasks and three real-robot manipulation tasks.", "§IV-A / §IV-E", "S4.SS1"],
        baseline: ["直接运行同一个冻结策略；另测随机、HDM 和外部模型验证。", "The same frozen policy without a verifier. Random, HDM and external-model verifiers are also tested.", "§IV-D / Table I", "S4.SS4"],
        result: ["仿真平均成功率从 78.8% 到 82.3%，真实任务从 44.7% 到 67.3%；仿真查询中位时间从 681 ms 到 718 ms。", "Mean success goes from 78.8% to 82.3% in simulation and 44.7% to 67.3% on real tasks. Median simulation query time goes from 681 ms to 718 ms.", "Table I / §V", "S4.T1"],
        setup: ["单张 NVIDIA H100 80 GB；查询时间包含仿真开销。", "One NVIDIA H100 80 GB. Query time includes simulator overhead.", "§IV-D / Table I", "S4.SS4"],
      }),
      paper("OpenVLA-OFT", "2502.19645v2", "https://github.com/moojink/openvla-oft", {
        method: ["微调 OpenVLA，结合并行解码、动作分块与连续动作表示。", "Fine-tunes OpenVLA with parallel decoding, action chunking and continuous action representations.", "§IV", "S4"],
        dataset: ["LIBERO-Spatial、Object、Goal、Long；下方结果取自 LIBERO-Long。", "LIBERO-Spatial, Object, Goal and Long. The result below is for LIBERO-Long.", "§V-A", "S5.SS1"],
        baseline: ["表 II 的 OpenVLA 为 4.2 Hz、0.2396 s，LIBERO-Long 成功率 53.7%。", "In Table II, OpenVLA achieves 4.2 Hz, 0.2396 s latency and 53.7% LIBERO-Long success.", "Table II", "S5.T2"],
        result: ["加腕部图像和本体状态的版本为 71.4 Hz、0.1120 s，LIBERO-Long 成功率 94.5%。", "With wrist-camera images and proprioception, the variant achieves 71.4 Hz, 0.1120 s latency and 94.5% LIBERO-Long success.", "Table II", "S5.T2"],
        setup: ["在 NVIDIA A100 上每个版本查询 100 次测速度；延迟以生成一个动作或动作块的时间计算。", "Each variant is queried 100 times on an NVIDIA A100. Latency measures the time to generate one action or action chunk.", "§V-C / Table II", "S5.SS3"],
      }),
    ],
  },
];
