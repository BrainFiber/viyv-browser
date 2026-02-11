import type { TabGroupColor } from './session.js'

export interface TabGroupInfo {
  groupId: number
  title: string
  color: TabGroupColor
  collapsed: boolean
  tabs: TabInfo[]
}

export interface TabInfo {
  tabId: number
  url: string
  title: string
  active: boolean
  status: 'loading' | 'complete'
}

export interface AgentTabMapping {
  agentId: string
  agentName: string
  tabGroupId: number
  color: TabGroupColor
  tabs: TabInfo[]
}
