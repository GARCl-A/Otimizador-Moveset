export interface MoveData {
  name: string
  type: string
  category: string
  power: number
  accuracy: number
  source: string
}

export class Move {
  name: string
  type: string
  category: string
  power: number
  acc: number
  effectivePower: number
  turns: number
  tags: string[]

  constructor(data: MoveData) {
    this.name = data.name
    this.type = data.type
    this.category = data.category
    this.power = data.power
    this.acc = data.accuracy
    this.effectivePower = data.power
    this.turns = 1
    this.tags = []
  }
}
