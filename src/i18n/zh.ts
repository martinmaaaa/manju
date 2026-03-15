export const zh = {
  appName: '添梯',
  welcome: '把灵感一步一步抬上去',

  nodes: {
    promptInput: '创意描述',
    imageGenerator: '文字生图',
    videoGenerator: '文生视频',
    audioGenerator: '灵感音乐',
    videoAnalyzer: '视频分析',
    imageEditor: '图像编辑',
    scriptPlanner: '剧本大纲',
    scriptEpisode: '剧本分集',
    storyboardGenerator: '分镜生成',
    characterNode: '角色设计',
  },

  actions: {
    doubleClick: '双击',
    canvasHint: '自由创建你的画布，或先查看固定工作流',
    generate: '生成',
    delete: '删除',
    copy: '复制',
    paste: '粘贴',
    undo: '撤销',
    save: '保存',
    cancel: '取消',
    confirm: '确认',
  },

  contextMenu: {
    createNode: '创建新节点',
    copyNode: '复制节点',
    deleteNode: '删除节点',
    replaceAsset: '替换素材',
    deleteConnection: '删除连接线',
    saveAsWorkflow: '保存为工作流',
    deleteGroup: '删除分组',
  },

  settings: {
    language: '语言',
    chinese: '中文',
    english: 'English',
  },
};

export type Translation = typeof zh;
