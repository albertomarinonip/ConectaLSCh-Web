import copy
import unittest
import numpy as np
from dataset import resample, partition, FEATURE_SIZE
from metrics import predictions, report, calibrate

class PipelineTests(unittest.TestCase):
    def test_time_parity_and_masks(self):
        obs=[{'time':t,'vector':[float(i)]*FEATURE_SIZE} for i,t in enumerate([0,10,1000,1100,1200,1300,1400,1500])]
        actual=resample(obs)
        self.assertEqual(actual.shape,(48,216))
        expected=[min(range(8),key=lambda j:abs(obs[j]['time']-t)) for t in np.linspace(0,1500,48)]
        np.testing.assert_array_equal(actual[:,0],expected)
        bad=copy.deepcopy(obs);bad[1]['time']=0
        with self.assertRaises(ValueError):resample(bad)

    def test_same_clip_in_different_groups_is_rejected(self):
        obs=[{'time':i*50,'vector':[float(i)]*FEATURE_SIZE} for i in range(10)]
        samples=[{'label':'HOLA','metadata':{'signerId':p,'sessionId':'s','captureMode':'dynamic'},'observations':obs} for p in ['A','B']]
        with self.assertRaisesRegex(ValueError,'leakage'):
            partition(samples,{'format':'conectalsch-splits-v1','groupBy':'person','groups':{'A':'train','B':'test'}})

    def test_rejection_and_calibration(self):
        probs=np.asarray([[.95,.02,.03],[.03,.94,.03]]+[[.1,.1,.8]]*20)
        y=np.asarray([0,1]+[2]*20)
        labels=['HOLA','GRACIAS','__UNKNOWN__']
        selected=calibrate(y,probs,labels,2)
        pred=predictions(probs,2,selected['threshold'],selected['margin'])
        stats=report(y,pred,labels,2)
        self.assertEqual(stats['macroF1'],1.0)
        self.assertEqual(stats['unknownFalseAcceptRate'],0)
        ambiguous=predictions(np.array([[.49,.48,.03]]),2,.5,.1)
        self.assertEqual(ambiguous[0],2)

if __name__=='__main__':unittest.main()
