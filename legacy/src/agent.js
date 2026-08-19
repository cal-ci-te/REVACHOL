import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { ChatOpenAI } from "@langchain/openai";

// ============================================================
// 1. 定义状态结构 - 使用官方推荐的写法
// ============================================================
const WorkflowState = Annotation.Root({
  // 输入 - 使用更简洁的写法
  requirement: Annotation({
    reducer: (a, b) => {
      // 确保始终返回字符串
      if (typeof b === 'string') return b;
      if (typeof a === 'string') return a;
      return '';
    },
    default: () => '',
  }),
  context: Annotation({
    reducer: (a, b) => {
      if (typeof b === 'string') return b;
      if (typeof a === 'string') return a;
      return '';
    },
    default: () => '',
  }),
  
  // 规划阶段
  plan: Annotation({
    reducer: (a, b) => {
      if (typeof b === 'string') return b;
      if (typeof a === 'string') return a;
      return '';
    },
    default: () => '',
  }),
  currentStep: Annotation({
    reducer: (a, b) => {
      if (typeof b === 'number') return b;
      if (typeof a === 'number') return a;
      return 0;
    },
    default: () => 0,
  }),
  totalSteps: Annotation({
    reducer: (a, b) => {
      if (typeof b === 'number') return b;
      if (typeof a === 'number') return a;
      return 0;
    },
    default: () => 0,
  }),
  
  // 编码阶段
  code: Annotation({
    reducer: (a, b) => {
      if (typeof b === 'string') return b;
      if (typeof a === 'string') return a;
      return '';
    },
    default: () => '',
  }),
  filesModified: Annotation({
    reducer: (a, b) => {
      if (Array.isArray(b)) return b;
      if (Array.isArray(a)) return a;
      return [];
    },
    default: () => [],
  }),
  
  // 审查阶段
  review: Annotation({
    reducer: (a, b) => {
      if (typeof b === 'string') return b;
      if (typeof a === 'string') return a;
      return '';
    },
    default: () => '',
  }),
  reviewPassed: Annotation({
    reducer: (a, b) => {
      if (typeof b === 'boolean') return b;
      if (typeof a === 'boolean') return a;
      return false;
    },
    default: () => false,
  }),
  reviewIssues: Annotation({
    reducer: (a, b) => {
      if (Array.isArray(b)) return b;
      if (Array.isArray(a)) return a;
      return [];
    },
    default: () => [],
  }),
  
  // 长文档处理
  documentAnalysis: Annotation({
    reducer: (a, b) => {
      if (typeof b === 'string') return b;
      if (typeof a === 'string') return a;
      return '';
    },
    default: () => '',
  }),
  codebaseSummary: Annotation({
    reducer: (a, b) => {
      if (typeof b === 'string') return b;
      if (typeof a === 'string') return a;
      return '';
    },
    default: () => '',
  }),
  
  // 控制流
  error: Annotation({
    reducer: (a, b) => {
      if (typeof b === 'string') return b;
      if (typeof a === 'string') return a;
      return '';
    },
    default: () => '',
  }),
  retryCount: Annotation({
    reducer: (a, b) => {
      if (typeof b === 'number') return b;
      if (typeof a === 'number') return a;
      return 0;
    },
    default: () => 0,
  }),
  maxRetries: Annotation({
    reducer: (a, b) => {
      if (typeof b === 'number') return b;
      if (typeof a === 'number') return a;
      return 3;
    },
    default: () => 3,
  }),
  
  // 元信息
  taskId: Annotation({
    reducer: (a, b) => {
      if (typeof b === 'string') return b;
      if (typeof a === 'string') return a;
      return '';
    },
    default: () => '',
  }),
  timestamp: Annotation({
    reducer: (a, b) => {
      if (typeof b === 'string') return b;
      if (typeof a === 'string') return a;
      return '';
    },
    default: () => '',
  }),
  stepHistory: Annotation({
    reducer: (a, b) => {
      if (Array.isArray(b)) return b;
      if (Array.isArray(a)) return a;
      return [];
    },
    default: () => [],
  }),
});

// ============================================================
// 2. 配置 AI 模型
// ============================================================
const plannerModel = new ChatOpenAI({
  model: "deepseek-v4-pro",
  temperature: 0.3,
  apiKey: process.env.DEEPSEEK_V4_PRO_API_KEY,
  configuration: {
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  },
});

const coderModel = new ChatOpenAI({
  model: "deepseek-v4-flash",
  temperature: 0.1,
  apiKey: process.env.DEEPSEEK_V4_FLASH_API_KEY,
  configuration: {
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  },
});

const reviewerModel = new ChatOpenAI({
  model: "kimi-k2.5-code",
  temperature: 1.0,
  apiKey: process.env.KIMI_API_KEY,
  configuration: {
    baseURL: "https://api.moonshot.cn/v1",
  },
});

const longContextModel = new ChatOpenAI({
  model: "mimo-v2.5",
  temperature: 0.1,
  apiKey: process.env.MIMO_API_KEY,
  configuration: {
    baseURL: "https://api.xiaomimimo.com/v1",
  },
});

// ============================================================
// 3. 辅助工具函数
// ============================================================
const log = (step, message) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${step}] ${message}`);
};

const countSteps = (plan) => {
  if (!plan || typeof plan !== 'string') return 0;
  const matches = plan.match(/\b(T\d+|\d+\.)\s/g);
  return matches ? matches.length : 1;
};

// ============================================================
// 4. 实现节点函数
// ============================================================

const longContextProcessor = async (state) => {
  log('LongContext', '开始分析项目文档');
  
  // 安全检查
  const context = typeof state.context === 'string' ? state.context : '';
  
  if (!context) {
    log('LongContext', '未提供项目上下文，跳过');
    return state;
  }

  const prompt = `
请分析以下项目上下文信息，提取关键架构和模块信息。

## 项目上下文
${context}

## 输出格式
1. 技术栈总结
2. 核心模块列表及其职责
3. 关键依赖关系
4. 开发注意事项
`;

  const response = await longContextModel.invoke([
    { role: 'system', content: '你是一个资深的技术分析师，善于从文档中提取关键信息。' },
    { role: 'user', content: prompt },
  ]);

  log('LongContext', '文档分析完成');
  
  return {
    ...state,
    documentAnalysis: response.content,
  };
};

const planner = async (state) => {
  // 安全获取 requirement
  const requirement = typeof state.requirement === 'string' 
    ? state.requirement 
    : '';
  
  log('Planner', `开始规划任务: ${requirement.substring(0, 50)}...`);
  
  if (!requirement || requirement.trim() === '') {
    return { ...state, error: '未提供任务需求' };
  }

  const contextInfo = typeof state.documentAnalysis === 'string' && state.documentAnalysis 
    ? state.documentAnalysis 
    : (typeof state.context === 'string' ? state.context : '未提供项目上下文');

  const prompt = `
你是一个资深的技术架构师，请分析以下需求并生成任务拆解清单。

## 项目上下文
${contextInfo}

## 需求
${requirement}

## 输出格式
请输出结构化的任务清单，每项任务包含：
- 任务ID: T1, T2, ...
- 任务描述: 具体要做什么
- 涉及文件: 预计需要修改哪些文件
- 依赖关系: 依赖哪些前置任务
- 优先级: 高/中/低

## 注意事项
- 任务粒度适中，每个任务应是可独立执行的
- 优先处理核心逻辑
- 考虑代码的可测试性
`;

  const response = await plannerModel.invoke([
    { role: 'system', content: '你是一个严谨的技术架构师，善于拆解复杂任务并制定清晰的实施计划。' },
    { role: 'user', content: prompt },
  ]);

  const plan = response.content;
  const totalSteps = countSteps(plan);
  
  log('Planner', `规划完成，共 ${totalSteps} 项任务`);
  
  return {
    ...state,
    plan,
    totalSteps,
    currentStep: 0,
    timestamp: new Date().toISOString(),
    stepHistory: [...(state.stepHistory || []), { step: 'planner', timestamp: new Date().toISOString() }],
  };
};

const coder = async (state) => {
  const stepNum = (typeof state.currentStep === 'number' ? state.currentStep : 0) + 1;
  const totalSteps = typeof state.totalSteps === 'number' ? state.totalSteps : 0;
  
  log('Coder', `开始编码 (步骤 ${stepNum}/${totalSteps})`);
  
  const plan = typeof state.plan === 'string' ? state.plan : '';
  
  if (!plan) {
    return { ...state, error: '没有可执行的计划' };
  }

  const prompt = `
你是一个高效的代码工程师，请根据任务清单执行编码任务。

## 任务清单
${plan}

## 当前执行
请执行第 ${stepNum} 项任务。

## 项目技术规范
- 使用原生 ES Module 语法
- 遵循项目现有的代码风格
- 添加必要的 JSDoc 注释
- 考虑边界情况和错误处理

## 输出格式
1. 说明修改了哪些文件
2. 提供完整的代码实现
3. 简要说明实现思路
`;

  const response = await coderModel.invoke([
    { role: 'system', content: '你是一个专注于代码质量的工程师，善于编写可维护、可测试的代码。' },
    { role: 'user', content: prompt },
  ]);

  log('Coder', `编码完成，输出长度: ${response.content.length} 字符`);
  
  return {
    ...state,
    code: response.content,
    stepHistory: [...(state.stepHistory || []), { step: `coder-${stepNum}`, timestamp: new Date().toISOString() }],
  };
};

const reviewer = async (state) => {
  log('Reviewer', '开始审查代码');
  
  const code = typeof state.code === 'string' ? state.code : '';
  
  if (!code) {
    return { ...state, error: '没有可审查的代码' };
  }

  const prompt = `
你是一个严谨的代码审查员，请审查以下代码。

## 代码
${code}

## 审查要点
1. 逻辑正确性：代码是否按预期工作
2. 性能问题：是否有潜在的性能瓶颈
3. 安全漏洞：是否有安全风险
4. 代码风格：是否与项目规范一致
5. 可维护性：代码是否清晰、有注释
6. 测试覆盖：是否包含合适的测试

## 输出格式
- ✅ 通过 / ❌ 不通过
- 问题列表（如果有，请逐条说明）
- 改进建议
- 总体评价
`;

  const response = await reviewerModel.invoke([
    { role: 'system', content: '你是一个严谨的代码审查专家，善于发现代码中的潜在问题和改进机会。' },
    { role: 'user', content: prompt },
  ]);

  const review = response.content;
  const passed = !review.includes('❌ 不通过') && !review.toLowerCase().includes('fail');
  const issues = review.split('\n').filter(line => line.includes('❌') || line.includes('问题'));
  
  log('Reviewer', `审查完成，结果: ${passed ? '✅ 通过' : '❌ 不通过'}`);
  
  return {
    ...state,
    review,
    reviewPassed: passed,
    reviewIssues: issues,
    stepHistory: [...(state.stepHistory || []), { step: 'reviewer', timestamp: new Date().toISOString() }],
  };
};

const routeAfterReview = (state) => {
  if (state.error) {
    log('Router', '检测到错误，转向错误处理');
    return 'handleError';
  }
  
  if (state.reviewPassed) {
    log('Router', '审查通过，流程结束');
    return END;
  }
  
  const retryCount = typeof state.retryCount === 'number' ? state.retryCount : 0;
  const maxRetries = typeof state.maxRetries === 'number' ? state.maxRetries : 3;
  
  if (retryCount < maxRetries) {
    const nextRetry = retryCount + 1;
    log('Router', `审查未通过，准备重试 (${nextRetry}/${maxRetries})`);
    return 'coder';
  }
  
  log('Router', '审查未通过，已达最大重试次数，转向错误处理');
  return 'handleError';
};

const routeBeforePlanner = (state) => {
  const context = typeof state.context === 'string' ? state.context : '';
  
  if (context && context.length > 500) {
    log('Router', '检测到大上下文，先进行长文档处理');
    return 'longContextProcessor';
  }
  log('Router', '直接进入规划阶段');
  return 'planner';
};

const handleError = async (state) => {
  log('Error', `工作流执行失败: ${state.error || '审查未通过'}`);
  
  const requirement = typeof state.requirement === 'string' ? state.requirement : '未提供';
  const taskId = typeof state.taskId === 'string' ? state.taskId : '未指定';
  const timestamp = typeof state.timestamp === 'string' ? state.timestamp : '未记录';
  
  const errorReport = `
## 错误报告

### 任务信息
- 任务ID: ${taskId}
- 时间: ${timestamp}

### 错误信息
${state.error || '审查未通过，已达最大重试次数'}

### 最后状态
- 需求: ${requirement.substring(0, 100)}
- 计划: ${state.plan ? '已生成' : '未生成'}
- 代码: ${state.code ? `已生成 (${state.code.length} 字符)` : '未生成'}
- 审查: ${state.review ? '已完成' : '未进行'}
- 审查结果: ${state.reviewPassed ? '通过' : '不通过'}

### 执行历史
${Array.isArray(state.stepHistory) ? state.stepHistory.map(h => `- ${h.step} (${h.timestamp})`).join('\n') : '无记录'}

### 问题列表
${Array.isArray(state.reviewIssues) ? state.reviewIssues.map(i => `- ${i}`).join('\n') : '无'}

请检查以上信息，修复问题后重新运行。
`;
  
  return {
    ...state,
    error: state.error || '审查未通过',
    code: errorReport,
  };
};

// ============================================================
// 5. 构建工作流图
// ============================================================
const workflow = new StateGraph(WorkflowState)
  .addNode("longContextProcessor", longContextProcessor)
  .addNode("planner", planner)
  .addNode("coder", coder)
  .addNode("reviewer", reviewer)
  .addNode("handleError", handleError)
  .addConditionalEdges(START, routeBeforePlanner)
  .addEdge("longContextProcessor", "planner")
  .addEdge("planner", "coder")
  .addEdge("coder", "reviewer")
  .addConditionalEdges("reviewer", routeAfterReview)
  .addEdge("handleError", END);

// ============================================================
// 6. 创建 checkpointer 并编译
// ============================================================
const checkpointer = SqliteSaver.fromConnString("./checkpoints.db");

// ============================================================
// 7. 编译并导出
// ============================================================
export const agent = workflow.compile({ checkpointer });

export { WorkflowState, planner, coder, reviewer, longContextProcessor, handleError };