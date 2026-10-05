def average(numbers):
    total = 0
    count = 0
    for n in numbers:
        total = total + n
        count = count + 1
    return total / count
