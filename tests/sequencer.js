const Sequencer = require('@jest/test-sequencer').default;

class CustomSequencer extends Sequencer {
    sort(tests) {
        // Sort tests to run subscription plans tests before billing tests
        // since billing tests might depend on plans being available
        const testOrder = [
            'admin-subscription-plans.test.js',
            'admin-billing.test.js',
            'dispatch.test.js'
        ];

        return tests.sort((testA, testB) => {
            const aName = testA.path.split('/').pop();
            const bName = testB.path.split('/').pop();

            const aIndex = testOrder.indexOf(aName);
            const bIndex = testOrder.indexOf(bName);

            if (aIndex === -1 && bIndex === -1) return 0;
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;

            return aIndex - bIndex;
        });
    }
}

module.exports = CustomSequencer;