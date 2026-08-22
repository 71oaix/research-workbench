# 检索效果评测报告（M2-16）

- 时间：2026-08-20T14:37:21.942Z
- 查询数：30（离线确定性检索，recall@20）

| id | 查询 | 耗时(s) | 查询组 | 请求数 | gap | 命中 | 去重 | 金标 | recall@20 | 失败源 | 降级源 |
|----|------|---------|--------|--------|-----|------|------|------|-----------|--------|--------|
| lit-1 | What papers discuss the effect of false negatives among hard negatives in dense retriever training? | 18.3 | 1 | 3 | 0 | 94 | 32 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3)（补偿 2） |
| lit-2 | Are there any studies on incorporating external commonsense knowledge into conversational models to enhance emotional support? | 6.7 | 1 | 2 | 0 | 49 | 48 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-3 | Could you recommend research that investigates the influence of cognitive biases on human interpretation of AI-generated explanations, specifically within the realm of explainable natural language processing? | 7.3 | 1 | 2 | 0 | 50 | 45 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-4 | What concerns or key points have been highlighted in scholarly articles about employing random divisions in machine learning datasets, especially with respect to contamination of the test set? | 6.8 | 1 | 2 | 0 | 49 | 48 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-5 | Could you suggest research that examines how well language models work with creole languages, particularly in relation to their effectiveness with Nigerian Pidgin, given its close linguistic relationship with English? | 7.1 | 1 | 2 | 0 | 50 | 50 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-6 | Is there a comprehensive dataset available for summarizing broad-spectrum conversational dialogues? | 2.6 | 1 | 1 | 0 | 25 | 22 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-7 | What are some studies that explore data-poisoning strategies that only require very few poisoned training examples? | 6.4 | 1 | 1 | 0 | 25 | 24 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-8 | What are some scholarly articles that explore scaling laws for parameter-efficient prompt tuning techniques for fine-tuning language models? | 6.6 | 1 | 2 | 0 | 48 | 46 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-9 | Can you give me a paper that does self-supervised contrastive learning of sentence embeddings by sampling in-batch negatives? | 6.4 | 1 | 1 | 0 | 25 | 24 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-10 | Could you recommend a study that initializes embeddings in multilingual transformer for subwords common with original vocabulary with original embeddings? | 4.9 | 1 | 1 | 0 | 22 | 17 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-11 | Which works shows that training large language models with purely mathematical and structural data can exhibit emergence of causal reasoning faster? | 11.5 | 1 | 2 | 0 | 49 | 47 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-12 | What research has been conducted on applying contrastive techniques to distinguish normal from abnormal imagery for the creation of radiology reports? | 6.0 | 1 | 1 | 0 | 21 | 20 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-13 | Which family of model generally perform the best for the event conceptualization task | 8.2 | 1 | 2 | 0 | 47 | 45 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-14 | Which paper utilizes language models to generate singable lyrics that can go well with a predefined melody? | 6.6 | 1 | 2 | 0 | 50 | 49 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-15 | Is there a tool that can automatically segment speech and the corresponding text transcriptions, to obtain a finer grained alignment? | 6.3 | 1 | 1 | 0 | 25 | 17 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-16 | Is there a paper that utilizes the characteristics of human evolutionary knowledge to guide language models in generating scientific ideas? | 7.3 | 1 | 2 | 0 | 50 | 46 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-17 | Which paper introduce a DRO (distribution robust optimization) like training objective for doing adversarial training without constructing adversarial samples. | 5.4 | 1 | 1 | 0 | 23 | 20 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-18 | Is there any paper that utilizes Gaussian processes to analyze the vulnerability of text-conditioned generative models? | 6.2 | 1 | 2 | 0 | 50 | 45 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-19 | Which paper first applied the chain-of-thought technique in the text summarization field? | 7.1 | 1 | 1 | 0 | 25 | 23 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-20 | Which research paper leverages event structure information from Abstract Meaning Representation (AMR) graphs to aid in recognizing causal relations between events? | 6.2 | 1 | 2 | 0 | 50 | 50 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-21 | In the field of reinforcement learning models for multi-hop reasoning, what issue involves an agent erroneously correlating a successful outcome with irrelevant or coincidental actions, and are there any papers discussing this phenomenon? | 8.8 | 1 | 2 | 0 | 50 | 42 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-22 | I am looking to understand more about sequence-to-sequence pre-training and its applications in natural language tasks. Can you suggest a significant paper that describes the denoising process for such models? | 13.5 | 1 | 2 | 0 | 49 | 47 | 1 | 100% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-23 | Which paper specifies the typical configurations used in fine-tuning deep bidirectional transformers like BERT and RoBERTa for language understanding tasks? | 5.6 | 1 | 1 | 0 | 23 | 18 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-24 | Can you recommend some literature that focuses on dependency-based models for relation extraction, especially those that utilize dependency parsing to capture non-local syntactic relations? | 8.1 | 1 | 2 | 0 | 47 | 47 | 4 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-25 | Where can I find a detailed discussion on automating the assessment of clarifications in instructional text, including tasks for grading these clarifications as plausible, implausible, or neutral and ranking them on a scale? | 4.7 | 1 | 1 | 0 | 25 | 24 | 1 | 100% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-26 | What paper first associate the modeling frequency with input human skeletons under the NeRF framework? | 6.1 | 1 | 2 | 0 | 50 | 48 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-27 | Is there any paper improves adversarial training by forming semantic aware label without extra pre-train time or data? | 8.1 | 1 | 1 | 0 | 23 | 21 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-28 | What work first uses LLM to code robotic simulation tasks and show sim-to-real benefits with policy pre-training in simulation? | 16.7 | 1 | 4 | 0 | 100 | 96 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-29 | Which paper utilized MMD flows with Riesz kernels to solve Bayesian inverse problems? | 10.7 | 1 | 1 | 0 | 24 | 23 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |
| lit-30 | Can we reduce visual tokens in vision transformers right from the beginning? | 7.8 | 1 | 1 | 0 | 25 | 25 | 1 | 0% | 无 | openalex(T1)、semantic-scholar(T3) |

- 平均 recall@20：6.7%（30/30 条有金标）

> precision 需要人工抽检：金标集合有限，recall 为保守口径。