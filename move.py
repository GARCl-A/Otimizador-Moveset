class Move:
    def __init__(self, *, name, move_type, category, power, acc):
        self.name = name
        self.type = move_type
        self.category = category
        self.power = power
        self.acc = acc
        self.effective_power = float(power)
        self.turns = 1
        self.tags: list[str] = []

    def __repr__(self):
        return f"Move({self.name}, {self.type}, {self.category}, {self.power})"
